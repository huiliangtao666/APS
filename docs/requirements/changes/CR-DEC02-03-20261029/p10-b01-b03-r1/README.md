# P10 B01–B03 Design r1

设计交付事件：`dlv_80aa3354-5aad-4e00-98fe-4ed9d338f174:r1`。本目录是CR-DEC02-03-20261029的业务设计增补，独立设计分支；不修改CR批准登记或产品main。设计结果PARTIAL（U01/U02待用户经PM决定），P10产品BLOCKED/NOT_EXECUTED，产品SHA=null。不能把设计分支出现文档当作业务批准或产品通过。

- [业务契约、授权分类、决定包与恢复条件](P10-B01-B03-BUSINESS-CONTRACT-r1.md)
- [44条验收矩阵](P10-B01-B03-ACCEPTANCE-r1.csv)：全部产品NOT_EXECUTED
- [24个合成数值样例](P10-B01-B03-SCENARIOS-r1.json)：含未批准推荐语义和决定对照
- [设计核对结果](P10-B01-B03-DESIGN-CHECK-r1.json)：24项分段算术与17个既有证据hash；不是产品Test
- [来源与交付散列](sources.json)、[设计算术重现脚本](design_math.py)

E01–E04既有范围：池身份/唯一容量、显式组映射、保留组资格人数上限、岗位max/sum、保存冻结与历史保护。可用显式输入继续工程开发，不等现场默认值。U01推荐共用关闭按任务独占；U02推荐交接为额外人数并与原岗相加；这两个选择未批准，不得自动启用。U03仅在取消旧组上限或增加资格交集语义时另作决定，不阻塞现有可表达模型。

PM沿原P10任务组织后续；Design未派Dev/Test/QA，未改原卡状态，未合main或发布。P08/P09、FR017、D01–D03和旧S06/S07原结论保留，FR007/022与完整CR仍NOT_READY，UAT WAITING_DEPENDENCIES。
