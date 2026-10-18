-- One row per supplier with the field names of the data service contract
-- (docs/ARCHITECTURE.md section 4), in source CSV order, plus the derived
-- fields used by sourcing profiles. Every API tool reads from this view.
--
-- Materialized because pivoting 190k score rows on every request is slow.
-- db/ingest.py refreshes it after each load. To refresh by hand:
--     refresh materialized view concurrently supplier_wide;

create materialized view supplier_wide as
with pivoted as (
select
    s.supplier_id,
    s.name as supplier_name,
    max(l.score) filter (where l.metric_key = 'Total_Risk_Index') as total_risk_index,
    max(l.level) filter (where l.metric_key = 'Total_Risk_Index') as total_risk_index_level,
    max(l.score) filter (where l.metric_key = 'Industry_Benchmark_Score') as industry_benchmark,
    max(l.level) filter (where l.metric_key = 'Industry_Benchmark_Score') as industry_benchmark_level,
    max(l.score) filter (where l.metric_key = 'Media_Sentiment_Score') as media_sentiment,
    max(l.level) filter (where l.metric_key = 'Media_Sentiment_Score') as media_sentiment_level,
    max(l.score) filter (where l.metric_key = 'External_Intelligence_Score') as external_intelligence,
    max(l.level) filter (where l.metric_key = 'External_Intelligence_Score') as external_intelligence_level,
    max(l.score) filter (where l.metric_key = 'Sub_Tier_Visibility_Score') as sub_tier_visibility,
    max(l.level) filter (where l.metric_key = 'Sub_Tier_Visibility_Score') as sub_tier_visibility_level,
    max(l.score) filter (where l.metric_key = 'Labor_Stability_Score') as labor_stability,
    max(l.level) filter (where l.metric_key = 'Labor_Stability_Score') as labor_stability_level,
    max(l.score) filter (where l.metric_key = 'Financial_Health_Score') as financial_health,
    max(l.level) filter (where l.metric_key = 'Financial_Health_Score') as financial_health_level,
    max(l.score) filter (where l.metric_key = 'Compliance_Risk_Score') as compliance_risk,
    max(l.level) filter (where l.metric_key = 'Compliance_Risk_Score') as compliance_risk_level,
    max(l.score) filter (where l.metric_key = 'Safety_Incident_Score') as safety_incident,
    max(l.level) filter (where l.metric_key = 'Safety_Incident_Score') as safety_incident_level,
    max(l.score) filter (where l.metric_key = 'Environmental_Exposure_Score') as environmental_exposure,
    max(l.level) filter (where l.metric_key = 'Environmental_Exposure_Score') as environmental_exposure_level,
    max(l.score) filter (where l.metric_key = 'ESG_Performance_Score') as esg_performance,
    max(l.level) filter (where l.metric_key = 'ESG_Performance_Score') as esg_performance_level,
    max(l.score) filter (where l.metric_key = 'Digital_Security_Score') as digital_security,
    max(l.level) filter (where l.metric_key = 'Digital_Security_Score') as digital_security_level,
    max(l.score) filter (where l.metric_key = 'Operational_Resilience_Score') as operational_resilience,
    max(l.level) filter (where l.metric_key = 'Operational_Resilience_Score') as operational_resilience_level,
    max(l.score) filter (where l.metric_key = 'Market_Sentiment_Score') as market_sentiment,
    max(l.level) filter (where l.metric_key = 'Market_Sentiment_Score') as market_sentiment_level,
    max(l.score) filter (where l.metric_key = 'Quality_Risk_Score') as quality_risk,
    max(l.level) filter (where l.metric_key = 'Quality_Risk_Score') as quality_risk_level,
    max(l.score) filter (where l.metric_key = 'Governance_Risk_Score') as governance_risk,
    max(l.level) filter (where l.metric_key = 'Governance_Risk_Score') as governance_risk_level,
    max(l.score) filter (where l.metric_key = 'Geopolitical_Risk_Score') as geopolitical_risk,
    max(l.level) filter (where l.metric_key = 'Geopolitical_Risk_Score') as geopolitical_risk_level,
    max(l.score) filter (where l.metric_key = 'Political_Stability_Score') as political_stability,
    max(l.level) filter (where l.metric_key = 'Political_Stability_Score') as political_stability_level,
    max(l.score) filter (where l.metric_key = 'Credit_Rating_Score') as credit_rating,
    max(l.level) filter (where l.metric_key = 'Credit_Rating_Score') as credit_rating_level,
    s.po_volume_eur,
    s.order_change_rate,
    s.delivery_rating,
    s.confirmation_rate as order_confirmation_rate,
    s.sourcing_risk_level,
    s.supply_chain_complexity
from suppliers s
join supplier_scores_latest l using (supplier_id)
group by s.supplier_id
)
select
    p.*,
    100 - p.delivery_rating as delivery_risk,
    100 - p.order_confirmation_rate as confirmation_risk,
    -- Min-max rescaled to 0-100 over the whole dataset
    100 * (p.order_change_rate - min(p.order_change_rate) over ())
        / nullif(max(p.order_change_rate) over () - min(p.order_change_rate) over (), 0) as change_risk
from pivoted p;

create unique index supplier_wide_id_idx on supplier_wide (supplier_id);
