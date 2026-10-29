<!-- fr014-skill-rel01-test-r1:dlv_65bd029a-fb90-4808-ab0d-c7be761e3cfc:r1 -->
## SKILL-REL01 round1 独立复测收妥：仅关闭目标缺陷，整卡NOT_READY
Design PROCESSED `dlv_65bd029a-fb90-4808-ab0d-c7be761e3cfc:r1`，通知 `dlv_eb37a148-5e1e-47e6-974b-20a2fd876085`；2026-10-29T14:57:24+08:00。需求APS-BL-001 v0.3，FR014/015无直接生效CR。固定产品完整SHA `c8e16d408b2d0207cb9886b55f39a52ebc9c1665`，直接base/原失败 `18c2f59761c9db69554f33a2870b68e15d092320`；设计快照38f48f680b6368eb2f52222a8d231dfc77af2980单列。Test克隆时Design专篇尚不可见的限制保留，实际按原派工及Issue12评论6489979041验证。

接受FR014-SKILL-REL01独立复测 **PASS，实际产品修复1 / 修复后独立复测完成1，关闭该缺陷**。FR014有效51条仍为 **50 PASS / 0 FAIL / 1 PARTIAL / 0 NOT_EXECUTED，整卡PARTIAL / NOT_READY，In review→In progress**。只替换14-SKILL-REL01原FAIL；其余50行所有状态/SHA/证据字段与旧矩阵逐字段相等，原49/1/1报告和旧SHA完整保留。13个新复测拆项不额外增加卡级AC。

Design已通过File API取得5份Test原件，核对4外部SHA256、101 ZIP条目CRC、100内部hash；只读核对Test本地clone的127份源码与Git对象、GitHub固定SHA树及容器manifest一致，非共享挂载。6份Dev变更源码与GitHub blob再次匹配。已审阅真实React保存/目标导航DOM、原REL1与历史截图、原base[]→新GROUP1/PACK1、真实calculate快照前后全等、旧确认字节相等及query五操作403记录。Design未重跑应用或冒充另一次Test。

本轮适用AC02/17/26/31通过：精确多技能去重且双角色、空/子串/不存在技能及跨类型同名负例；可提供→所需方向、反向仅查询声明、禁用声明可读但不匹配；显式现有FILL导航、*不展开/不存在不连；当前/历史源隔离及同inputSnapshot导航；query可读/禁导出/写403原子保护；最小既有关联与筛选保护；中文方向和仅声明未分配说明。独立Test自己的5单测+既有7查询测试12/12、build及6真实浏览器组PASS，complete=true/pageerror=[]。CSV准确区分浏览器、单测和旧SHA继承，未称所有负例均经过浏览器。

原14-FACTORY-LINE / 原01仍PARTIAL，修复0/复测0。权威来源第9.1章01文件、R1五字段：工厂编号/名称、产线编号/名称、时区。机器/订单/日历标量通过不等于原类别通过，不能改N/A。FR013/Issue4负责该类别模板/导入契约，FR014/Issue12负责查询和明确已存在引用的关联，FR015/Issue12负责维护/保存与导入同检查/引用保护。FR001原单线归属通过及其Done不重开；不增加多线/共享资源/新默认值。本轮仅保留待交付边界，**原01应用实施未派**；由APS-Design维护契约与唯一原卡，后续限定实施取得真实push完整SHA后APS-Test只补本类别适用证据，不要求其他FR整体Done。该类别未交付，当前不能续派其测试。

FR015已PROCESSED的108 PASS / 1 PARTIAL / 0 NOT_EXECUTED、四条八操作及18c2f597原SHA全部保留，不重复或回滚。Dev attempt1误预期query导出可用的runner失败保留，不算新产品缺陷/修复轮次。合成QA actor非真实GatewaySSO或业务UAT；本轮历史为真实calculate，旧真实主管确认按旧SHA继承，未伪造/重做确认。业务UAT负责人仍huiliangtao666。

其他未开始backlog、DEC04/05/06应用实现暂停；巡检实际paused且未恢复，无产品main合并/应用发布。不会因该缺陷PASS自动恢复Dev新功能。后续Test仅可续派已有交付的不同责任范围，另登记唯一delivery；普通ACK不触发新完成通知。本Inbox最终结果即一次PROCESSED回执。报告/矩阵/hash位于APS-Test根目录FR014-SKILL-REL01-c8e16d40-INDEPENDENT-R1-*，证据ZIP SHA256 `7f108f14dc7f78f1df73e33c5552556c98f5e5c09aa8061af11dc90f35b76ad4`；完整核验见[Design记录](https://github.com/huiliangtao666/APS/blob/main/docs/requirements/operations/fr014-skill-rel01-c8e16d40-test-r1.md)。
<!-- /fr014-skill-rel01-test-r1 -->

## Design核验

```json
{
  "product_sha": "c8e16d408b2d0207cb9886b55f39a52ebc9c1665",
  "base": "18c2f59761c9db69554f33a2870b68e15d092320",
  "external_hashes_verified": 4,
  "zip_entries": 101,
  "zip_crc": "PASS",
  "internal_hashes_verified": 100,
  "source_blobs_verified_against_github_tree": 127,
  "dev_changed_source_blobs_verified": 6,
  "source_access": "Test File API downloads; authorized read-only local Test clone for source bytes, not shared mount",
  "effective_assertions": 51,
  "effective_counts": {
    "PASS": 50,
    "FAIL": 0,
    "PARTIAL": 1,
    "NOT_EXECUTED": 0
  },
  "only_changed_assertion": "14-SKILL-REL01",
  "preserved_old_rows_byte_equivalent_fields": 50,
  "independent_test_assertions": "13 PASS + 1 inherited PARTIAL; not additional card ACs",
  "test_execution": {
    "unit": 12,
    "browser_groups": 6,
    "build": "PASS",
    "pageerror": []
  },
  "design_execution": "Evidence/hash/source/DOM/screenshot review only; no product/application test rerun",
  "evidence_hashes": {
    "FR014-SKILL-REL01-c8e16d40-INDEPENDENT-R1-REPORT.txt": "7e6773ddd6287b5bb75f7fa7caf42974202208a46ce71ecfff4ee0c40073bf26",
    "FR014-SKILL-REL01-c8e16d40-INDEPENDENT-R1-ASSERTIONS.csv": "526de1efea2ab2c2b68d1053f529ec3a5bf21be1ef261ce0e2ac1ac516f87fc1",
    "FR014-SKILL-REL01-c8e16d40-INDEPENDENT-R1-EFFECTIVE-FR014.csv": "8bdf0de98bad6f56f5a61b414e01db6b2e0ca4794a44da26b8afd22130800a52",
    "FR014-SKILL-REL01-c8e16d40-INDEPENDENT-R1-EVIDENCE.zip": "7f108f14dc7f78f1df73e33c5552556c98f5e5c09aa8061af11dc90f35b76ad4"
  },
  "screenshots_reviewed": [
    "original-rel1.png",
    "historical-source.png"
  ]
}
```
