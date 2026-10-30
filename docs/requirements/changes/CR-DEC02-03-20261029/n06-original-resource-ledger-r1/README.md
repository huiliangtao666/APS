# N06 原始资源事实账业务设计 r1

DESIGN_REVIEW `dlv_778b0eb7-a369-44c2-9a41-315c2dd72e1b:r1`。

- [业务契约](N06-ORIGINAL-RESOURCE-CONTRACT-r1.md)：单连续、来源完整、已知释放有限区间可交PM沿原授权续做。
- [F01–F12来源/阻断矩阵](N06-FIELD-SOURCE-MATRIX-r1.csv)、[原Dev逐字段证据](dev-input/FIELD-BLOCKERS.csv)。
- [16项验收例](N06-ACCEPTANCE-MATRIX-r1.csv)、[显式mock](N06-MOCK-CASES-r1.json)。
- [来源索引](N06-SOURCE-INVENTORY-r1.json)、[离线设计算术/覆盖核对](N06-DESIGN-CHECK-r1.json)、[复核脚本](design-check.py)。

设计结果PARTIAL。新产品SHA=null；产品/独立Test/QA UAT均未执行。真实客户逐资源原账仍缺，mock不能替代。未知释放/暂停的相关未来试算和确认仍BLOCKED；U01/U02由用户经PM决定，多不连续窗口/额外业务值单列。CR-DEC04-05-06仅设计/mock。

本提交仅文档，不改基线、CR批准/实施状态、原卡、产品代码或main。PM沿原Dev任务组织续做，固定新产品SHA再安排独立Test。整份客户原DOCX/ZIP在私有交付包供接收方核对，不在此公开目录；来源摘要和原字段hash可在本目录复核。仅本次Inbox结果hook回传，不另发重复通知。
