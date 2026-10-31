# B09 main串行整合交付 r2

Dev本次范围 **PASS / DONE**；Issue38整包建议 **NOT_READY**，QA UAT未执行。已普通push main `a0b846e5b7aba5ee165b8d12fabfe8896fbc4ff2`。最新授权已置顶更新并登记aps-dev、aps-collaboration-contract、aps-domain-context，历史条款保留且注明覆盖。

原delivery `dlv_ddea429a-af36-46f2-be80-25c6c26f9da4`，修订r2，event_key `dlv_ddea429a-af36-46f2-be80-25c6c26f9da4:r2`。本次授权接续delivery `dlv_4c01a1e7-3520-4764-81a6-b7438c2b41f1` / `aps:mainline-backlog-override:20261031:r1:dev`。唯一原Issue https://github.com/huiliangtao666/APS/issues/38 ，Project2 item `PVTI_lAHOFM9WU84BpE1czhE8kKE`；不新建角色卡，不重复r1或旧PROCESSED。

源及父关系：

- B08源 `12d453d7cb03829dc609115e48c5e4c19af4a6ec`，B09最终源 `66d4d43e4b1cc566a47d96a93671d179d8921434`，已包含Test物料源 `579fe0589757154857c519e4968dee1e288ca9a0`（其父为B08源）。Test10源文件与最终main逐字相同。
- 实时初始main `c48d214f8197d1346eccbb8886bb7138eb263d56`；与B09源merge-base `96a9dae3ff13d3254c091567fa57cad5d8f37279`。main独有1300文件及候选独有71文件均逐项保持；双方共同改动仅server/business.mjs，自动合并保留main共享访问/恢复等行为，并新增materialChecked/materialDemands预览字段。无文本冲突，治理目录逐字保留；未吸收保护分支d462fb0、待定UIUX或未批准CR。
- 首次合并 `6879621b7b1e907b921024fc76af4c110576f2c1` 双父 `c48d214f8197d1346eccbb8886bb7138eb263d56` / `66d4d43e4b1cc566a47d96a93671d179d8921434`。
- 推送前再次fetch发现PM新增治理提交 `f9e13938a7c6f52b857a06c0f4e7a24bb0c5a1ab`，仅新增B09核验JSON。普通merge保留该记录，形成最终 `a0b846e5b7aba5ee165b8d12fabfe8896fbc4ff2`，双父 `6879621b7b1e907b921024fc76af4c110576f2c1` / `f9e13938a7c6f52b857a06c0f4e7a24bb0c5a1ab`，冲突0。src/server/public/qa/package及lock树与687逐字一致，全部前端静态资产hash一致。
- 最后fetch确认远端main为当前祖先，再普通push；GitHub API与ls-remote均回读 `a0b846e5b7aba5ee165b8d12fabfe8896fbc4ff2`，工作树干净、分支保护查询false。无force/reset/revert、历史重写、应用发布或部署覆盖。最终SHA为本次产品main，需求/设计来源c48及PM治理f9另列，不能当产品测试版本。

需求依据：APS-BL-001 v0.3及适用已生效CR-DEC02-03；FR002/009/010/011、BR08/09/18及联动范围保持原r1逐条映射。新主线授权改变整合与空闲资源续派规则，不增加业务语义。

验证与影响：

在687固定SHA：11组实际UI多CSV导入/编辑→零写预览→真实Worker→来源/任务→保存重开→原生导出、27条独立Fraction断言、21条适用接缝/整合/配置/来源测试、113库测试、126 API/权限/Worker/恢复/共享访问测试、5查询UI测试全部通过。补B08的8组实际来源导航/历史冻结/角色检查；诊断COPY明确不是分配器输出。真正日历60→0倒置与缺工时/工装引用/BOM错误同现的四类定位/拒绝/零写入通过。所有测试原件保留该SHA，不把旧PASS迁签到最终SHA。

最终main产品树/全部资产与687完全一致；在a0b实际重新执行4组主线UI链：162.5=100+62.5齐套、冻结/过期排除和37.5已有占用扣除；原09字面独立保存且只用规范化BOM计算一次；62.4晚批导致精确0.1缺口、所有未排任务保留；当前编辑不反算旧来源/快照/原生导出。最终main实际进程重启后API与UI重开、原生CSV原始bytes/hash一致。构建镜像源校验3337文件，workBuild=false。

早期标准构建两次被Docker OOM终止；保留原日志及容器OOM标记。共享Linux可用内存不足400MB，停止本工作区9个遗留自测容器后升至约842MB，标准tsc/Vite/API/Worker构建全部通过。没有停止QA/线上容器。首次扩展接缝有2项缺测试前置原件/UAT07_OUT，补齐UAT08原件和标明来源的UAT07录制fixture后仅重跑对应6项，均通过。重启后的首次过早HTTP探测失败，ready后重开通过。这些是环境/自测准备记录，不计产品FAIL或QA返修轮次。

QA固定入口：http://host.docker.internal:18173/ （VM http://127.0.0.1:18173/），新容器 `aps-b09-qa-main-a0b846e`，最终main `a0b846e5b7aba5ee165b8d12fabfe8896fbc4ff2`。/api/uat-build核SHA、workBuild=false、3337源与资产/配置指纹；76个HTTP对象及跨容器回读通过。全新私有模拟revision1、plans0/runs0，planner/supervisor/query为明确模拟，可从/__qa/role/对应角色进入；不依赖正式账号。仅初始化数据，没有替QA运行或验收。旧18169候选及旧QA环境未改，Portal/线上部署未动。

闭包含逐项矩阵、逐FR/BR/Issue收口、两阶段源/资产manifest、版本与合并证据、日志/截图/HTTP轨迹、原始75件CSV及可修改profiles、原件hash、技能/登记回执、最终main691文件可运行源码子集和SDK/公开固定Node镜像重建配方；全3337文件manifest另列。最终portable配方本修订未另行独立重建；实际固定源QA镜像已构建并运行。重建仍需Docker及registry/npm网络，不宣称离线镜像。原Test域54/23/4与r1证据保留其原SHA及固定GitHub引用，不重复同断言整套。

限制与下一步：

原09→版本/单位/基准/收率/损失及未知换算仍WAIT_APPROVAL，PM→用户；规范化可替换模拟独立显式输入。DEC04–06仍仅设计/mock；CR-FR010020-RESERVATION effective=false，未实现全局预占、真实扣库、到货登记或质量放行。旧UAT05/07/08结论保留原SHA；合main不代表QA PASS、整FR/CR验收或Issue38 Done，不关闭任何QA Log，无新产品修复轮次。

下一负责人APS-PM：核本r2原件和最终main入口，安排/接续APS-QA以最终main SHA先UAT09，再依09结论安排10/11。已在旧66候选执行的QA记录保留原SHA，只核变更影响，不静默迁签。APS-Test #39 B12独占计算域可按新授权独立推进；其已自测源交由Dev下一轮串行整合并核真实依赖，本次未提前吸收未交付B12。r1中不启动39+和禁合main为历史，已被本次授权覆盖。

交接按原delivery修订r2发送一次DEV_DELIVERED至APS-PM；queued仅SENT，未收到PROCESSED时不宣称闭环。固定GitHub证据和本工作区ROOT附件提供可读取通道，不把已知403的PM ROOT上传路径当成已送达。
