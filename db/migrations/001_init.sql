-- Initial schema for the supplier risk database.
-- Plain Postgres + pgvector, compatible with Supabase.

create extension if not exists vector;

-- Embedding dimension is fixed per column. 1024 matches common embedding
-- models (e.g. Voyage); change it here before any embeddings are stored.

-- Data sources and ingestion runs, so every row can be traced to its origin
create table sources (
    source_id     bigint generated always as identity primary key,
    name          text not null unique,
    kind          text not null,              -- csv, markdown, research, user
    description   text,
    file_path     text,
    created_at    timestamptz not null default now()
);

create table suppliers (
    supplier_id              text primary key,
    name                     text not null,
    po_volume_eur            numeric(14, 2),
    order_change_rate        numeric(5, 2),   -- percent 0-100
    delivery_rating          numeric(5, 2),   -- percent 0-100
    confirmation_rate        numeric(5, 2),   -- percent 0-100
    sourcing_risk_level      text check (sourcing_risk_level in ('Low', 'Medium', 'High')),
    supply_chain_complexity  text check (supply_chain_complexity in ('Simple', 'Moderate', 'Complex')),
    extra                    jsonb not null default '{}'::jsonb,  -- attributes without a dedicated column
    source_id                bigint references sources (source_id),
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

-- Data dictionary: one row per metric, loaded from the criteria markdown
create table metric_definitions (
    metric_key        text primary key,       -- matches the CSV column name
    display_name      text not null,
    category          text not null,          -- risk_score, operational
    description       text not null,
    unit              text,                   -- score_0_100, eur, percent, category
    higher_is_worse   boolean,
    embedding         vector(1024),
    source_id         bigint references sources (source_id)
);

-- Risk scores in long format: new metrics or sources become rows, not columns
create table supplier_scores (
    supplier_id   text not null references suppliers (supplier_id) on delete cascade,
    metric_key    text not null references metric_definitions (metric_key),
    score         smallint not null check (score between 0 and 100),
    level         text not null check (level in ('Low', 'Medium', 'High', 'Critical')),
    source_id     bigint not null references sources (source_id),
    as_of         date not null default current_date,
    primary key (supplier_id, metric_key, source_id, as_of)
);

create index supplier_scores_metric_score_idx on supplier_scores (metric_key, score desc);

-- Unstructured knowledge: research notes, reports, web findings
create table documents (
    document_id   bigint generated always as identity primary key,
    supplier_id   text references suppliers (supplier_id) on delete set null,
    title         text not null,
    content       text not null,
    metadata      jsonb not null default '{}'::jsonb,
    source_id     bigint references sources (source_id),
    created_at    timestamptz not null default now()
);

create table document_chunks (
    chunk_id      bigint generated always as identity primary key,
    document_id   bigint not null references documents (document_id) on delete cascade,
    chunk_index   int not null,
    content       text not null,
    embedding     vector(1024),
    unique (document_id, chunk_index)
);

create index document_chunks_embedding_idx on document_chunks
    using hnsw (embedding vector_cosine_ops);

-- User input: notes, score overrides, decision rationale
create table user_inputs (
    input_id      bigint generated always as identity primary key,
    supplier_id   text references suppliers (supplier_id) on delete cascade,
    author        text not null,
    input_type    text not null check (input_type in ('note', 'override', 'decision', 'rating')),
    content       text,
    data          jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now()
);

create index user_inputs_supplier_idx on user_inputs (supplier_id);

-- Wide view with the latest score per metric, for the frontend and quick queries
create view supplier_scores_latest as
select distinct on (supplier_id, metric_key)
    supplier_id, metric_key, score, level, as_of
from supplier_scores
order by supplier_id, metric_key, as_of desc;

create view supplier_overview as
select
    s.*,
    jsonb_object_agg(l.metric_key, l.score) as scores,
    jsonb_object_agg(l.metric_key, l.level) as levels
from suppliers s
left join supplier_scores_latest l using (supplier_id)
group by s.supplier_id;
