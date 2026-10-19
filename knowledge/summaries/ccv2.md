# 角色卡 V2 规范：摘要

Tavern Studio 撰写的摘要。上游仓库没有许可，所以这里不收录原文；原文见 <https://github.com/malfoyslastname/character-card-spec-v2>，所用的提交记在同目录的 `source.json` 里。V3 规范（`knowledge/ccv3/`）逐个收录了 V2 的字段，细节以 V3 为准。

## 结构

- 卡片是一个 JSON 对象：`spec` 为 `"chara_card_v2"`，`spec_version` 为 `"2.0"`，其余字段都在 `data` 里。
- V1 的六个字段原样保留，移进 `data`：`name`、`description`、`personality`、`scenario`、`first_mes`、`mes_example`。
- PNG 卡片把 JSON 以 base64 写进 `tEXt` 块，关键字是 `chara`。SillyTavern 导出时另写一个关键字为 `ccv3` 的块，读取时优先读它。

## V2 新增的字段

- `creator_notes`：写给使用者的说明，不进提示词。
- `system_prompt`：替换前端设置里的系统提示词，`{{original}}` 处插入前端原来的内容。SillyTavern 在它为空时沿用自己的设置。
- `post_history_instructions`：放在聊天记录之后的指令，同样支持 `{{original}}`。
- `alternate_greetings`：`first_mes` 之外的备选开场白。
- `character_book`：角色自带的世界书，见下节。
- `tags`、`creator`、`character_version`：元数据，不进提示词。
- `extensions`：各前端存放自己数据的地方，默认为空对象。不认识的键必须原样保留。

## character_book

- 世界书：`entries` 与 `extensions` 必填；`name`、`description`、`scan_depth`、`token_budget`、`recursive_scanning` 可选。
- 条目：`keys`、`content`、`extensions`、`enabled`、`insertion_order` 必填；`case_sensitive`、`name`、`priority`、`id`、`comment`、`selective` 与 `secondary_keys`、`constant`、`position`（`before_char` 或 `after_char`）可选。
