# B15 main 整合及共享入口交付

main 整合与本次共享入口自测 **PASS**；Issue40 完整原19类输入链及整包 **PARTIAL / NOT_READY**；QA UAT **NOT_EXECUTED**。已普通推送产品 `19e43ef7db177d750a5eb7e8754692a7362b3332`，直接父 `f709779b570f05a5b6be067cf1243baddc28a32d`，GitHub API 与 ls-remote 回读一致。没有强推、reset、revert、发布、覆盖旧QA入口或迁签历史PASS。

本次沿原main任务 `dlv_4c01a1e7-3520-4764-81a6-b7438c2b41f1` 接续，结果修订 r2，event_key `dlv_4c01a1e7-3520-4764-81a6-b7438c2b41f1:r2`。B15接入 delivery `dlv_1ab0048f-351e-48f4-afc7-5dae95d37b8c`；dispatch `b15:verified-domain:dev-main-handoff:20261031:r1`；源event `dlv_586f8017-7984-445c-865d-f73cbd231c6f:r1` 保留。B12 r1交付不重做。B15本报告/证据包为r1，不与原main结果r2混淆。

唯一原卡/包：[Issue40](https://github.com/huiliangtao666/APS/issues/40) 与 Project2。依据 APS-BL-001 v0.3、适用生效CR及原33行责任，覆盖UAT15/17/18与本包AC责任；DEC04–06/B02/P1未扩展。设计SHA=null。FR031原Done及旧修复轮次保留，不重开。

实时起点 main `b8512a3853160fca8deaf374cb1c5da3ea9e771c`；源 `68cea51e9be162797776bf2da84c1492d9c61494`，父 `b3b80e07083cb31d75ec522847f2c328c45cd112`；merge-base `66d4d43e4b1cc566a47d96a93671d179d8921434`。唯一文件交集为plan-comparison，无文本冲突。整合merge `474c0c48c9d7372383c9c42e387a77b57c50af45` 的双父为起点main与源。main较新的restoreBlockers确认历史函数逐字保留；B15保护及事件域blob与源一致。推送前再次fetch，main未推进。Test #41独占data-query/result-assessment/delivery-assessment/delivery-policy/r7-handoff及qa/r7-test-*均未修改。

共享入口结果：

- 输入保存、试算保存/预检/重排/保留消费trialInputIssues；事件批任何拒绝不写原事实、CSV来源或部分效果。试算人员编辑新增同一事务校验的零写入预检，页面可一次提交多表草稿。
- 拖拽/锁定保持预览→完整独立复核→显式提交。checkProtectedTasks核已开始/完成投影、锁与保护截止；valid只表示保护通过，requiresResourceVerification=true。资源、物料、日历、机器与前序另做独立检查；保护通过但前序非法仍拒绝。
- 保护失败的同步计算返回409 calculated_protection_conflict；真实Worker记failed且不保存候选方案，只保留失败运行/审计；原方案、事实、锁及输入不部分应用。旧FR027三条“保存冲突部分草稿”的期待已改为拒绝候选，同时保留原锁/历史不变断言，没有放宽标准。
- 复制、保留、放弃消费冻结独立快照与决策助手，不替换原方案或确认历史。比较显示保存的执行事实、耗料、条件和瓶颈证据，不推断单一条件因果、全局最早或真实交付。
- Dev实际页面自测修正了两类刷新接缝：重算仅改变latestPlanId时拖拽面板须更新；快速Worker完成后运行/方案/试算头的并发读取须收敛。另补普通路线任务的冻结工时/路线来源导航，按保存的产品+工序匹配，不解析任务ID或当前profile。没有新增业务公式。

验证记录与SHA边界：

- `3a0531ec42cd8aaedbba09c99a418517d42d7681` 上121项定向/接缝、113项库及124项API/权限检查通过。最终server、package、锁文件及排程/保护/事件/比较核与该执行树一致；后续lib差异仅resource-workbench来源导航。旧日志保持原SHA，以影响分析复用，不迁签为最终重跑。
- 最终19e43ef的tsc/Vite/服务与Worker构建通过；14项B15/B09/B12实际API、Worker、原子拒绝、试算预检与来源接缝通过；三个独立私有数据场景经真实React、应用Worker、页面条件编辑、独立复核、比较、保留/放弃、原生CSV及旧方案保护，共9组页面检查通过。
- 最终38项独立Fraction、区间、数量、前序与CSV解析核验通过。UAT15已完成0–30/30–60不动，组/池1→2后B仍等到180，原耗料和N06历史占用不反算；UAT17完整290+等待60=350、要求90迟260，热加工120未压缩；UAT18混合60–100、灌装130–160、规范化700/1000×250=175kg，原30分钟输入保留。
- 最终实际进程重启后，存储字节、冻结运行输入、原任务及原生CSV哈希保持一致。原19导入拒绝及显式订单选项后的深层问题均零写入；逐文件57行审计和原件字节/hash单列。
- 源六件原件与固定c818760逐bytes/hash一致，5项外层索引、ZIP CRC与202内部文件hash复核通过；源90/90和34独立检查属于原源版本，不升格最终整包或QA通过。

工程候选使用同一完整SHA、三个私有数据目录，入口分别为：UAT15 `http://host.docker.internal:18210/`，UAT17 `http://host.docker.internal:18211/`，UAT18 `http://host.docker.internal:18212/`。VM将host.docker.internal换成127.0.0.1。`/__qa/role/planner|supervisor|query`切换显式模拟成员；无需正式账号，不声称客户SSO已验。`/api/uat-build`、`/__qa/source-manifest.json`及`/fixtures/UAT-<id>/PROFILE.json`提供版本、3371个受控文件、资产、数据及原件指纹。仅初始化各自profile，revision1/plans0/runs0，没有替QA计算或签收。UAT15新运行开始分钟须填60，保留更早的已完成事实。三个场景不能通过删除已完成事实共用同一状态。

这些是工程候选，PM须结合下列剩余责任决定具体QA入口和顺序；不自动标整体READY_FOR_UAT。现有18173、B12 18178及旧QA固定SHA均未覆盖。

原19与显式mock分开：profile全部使用规范化模拟CSV，不能冒称原19未改直通。UAT15的N06历史共享资源账由模拟提供方显式给出，完整冻结来源、任务/批、采用、量、历史规则和释放；序列化前把可选空列明确保留，并以同一事实构造创始账，不修改已有账。UAT17沿用固定kg五工序/R4模型、PACK50及等待60；UAT18使用显式版本/日期/单位/基准，LEAN650→700同时FAT150→100维持总1000、240/0.96=250。它们均是可替换模拟，不是现场默认或推断的原09映射。

剩余关闭条件与唯一责任：

- **完整原19链 PARTIAL，Dev/PM沿Issue40与既有B12责任继续。** 三场景直接原19分别6/3/3项早期问题；只显式补原17后，继续显露原05 T01/G01/G60唯一READY映射、原06 LP01的班次/物理池/参与窗、原12“由BOM计算”运行绑定及部分资源类型/规则合同。批准明确的05/06/17配置属于Dev现有责任；当前尚未把原CSV整套查询、编辑、运行采用全部闭合。原12物料/未知原09及额外业务含义由PM汇总已有依据向用户确认，Dev不补公式。
- **FR027整体范围 PARTIAL，Dev/PM。** 本次普通未开始任务实际拖拽、允许设备、锁定、重排及负面通过；生产批/合批位置仍显示既有未支持边界，不能把UAT18普通任务通过替代所有批语义。由原Issue40继续明确/完成适用残余，不新建角色微卡。
- **B12原残余维持原卡责任。** PACK按支数的产品速度/效率/单位(A01)、跨批包材取整/非kg粒度/通用重组及新尾批语义(A02)继续PM→用户；BR13方向/资源/时长/人员/等待/禁配完整责任仍由Dev沿原清单补齐，不把固定pair或本B15通过视作完成。
- **查询报表/完整确认前判定责任由Test #41交源后串行吸收。** 本轮未写其独占域；既有确认历史保护及相关回归保留，不能据此代替#41整包结论。33行表逐项列出本轮证据、未覆盖、owner与下一动作，原关闭Issue历史未重开。
- **整体UAT15/17/18 NOT_EXECUTED，PM/QA。** PM核固定候选、上述原卡残余及具体入口，按现有B09/B12→B15顺序调QA。没有关闭QA Issue Log，没有新增历史产品FAIL修复轮次；Dev自测和合main不等于整FR/CR/Issue Done。

复演包含产品源码子集、SDK包、显式profile、原件、构建配方、测试与独立核验脚本，源码按实际Git版本逐文件校验。实际候选已从完整3371文件构建运行；portable子集不冒称完整源码清单，需Docker及registry/npm网络，本轮没有再从公开基础镜像独立重建。原始日志还保留了测试目录缺失、夹具空列/运行下界、跨场景事实保护、浏览器选择器及容器OOM等准备/环境记录，与自测发现并修正的真实UI接缝分开。

交付包含报告、14/9/38等逐项矩阵、57行原件审计、33行收口、环境/来源/冲突影响、ZIP及hash。GitHub固定产品可独立取得；证据固定SHA、PM发送记录及状态见HANDOFF。按原main event_key r2一次发送APS-PM；未获PROCESSED只记“已发送，待回执”，不形成ACK回环。
