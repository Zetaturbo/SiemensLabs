# Chat panel

useChat (ai) against /api/chat, sends WorkflowContext on every turn, renders text parts through the OpenUI
<Renderer> with the library from src/lib/openui, shows tool-call parts as "running <skill>" states,
and applies ui_actions (add_to_shortlist, set_profile, open_supplier, start_research, assign_part, set_case_stage).
