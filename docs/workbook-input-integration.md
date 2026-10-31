# Issue45 / CR-INPUT-DATA-20261031 工程候选

原 delivery：dlv_e9697b2c-0e04-4f91-93d3-fe5787e42a49；结果 event_key 为同 delivery:r1。沿原44957cda队列及包装62208099接续；共享实现和 main 串行整合 owner 为 APS-Dev。B09新责任按最新PM登记从已关闭#38接入#45；不重开旧卡或历史修复轮次。

本提交是可取得的工程候选，**完整35条新增断言尚未验证，整包NOT_READY，QA NOT_EXECUTED**。类型检查、独立组件/域及若干开发阶段HTTP检查不代替完整输入升级验收。原始设计15件及D0原件保留原字节，不把设计SHA当产品SHA。主输入设计为13e2eeed4438cb0b200db9c4de3781c7f1248be3；D0为8676c79d9805b4d55fbb0d98a9ac9c8ab6424e44。

## 实际代码

- App新增“输入数据”入口，需求/库存/生产/补单四子页，中文字段、服务端筛选排序分页、同源参数维护、版本冲突、引用删除保护、原件下载、就绪问题定位及维护返回。
- 整本xlsx经Node标准库受限OOXML读取，不启动Excel、不执行宏/外链/通用表达式。按中文表头和sheet识别，保留物理行、单元格、公式字面、参考表分类。公式白名单解释与参数重建；未知/重复表头、外键、循环、有效期等问题阻止提交。保留原文件hash，提交检查预览版本、重试幂等；改版不隐式删除缺行。
- 原件和不可变压缩快照由现有服务端数据目录持久化；索引原子rename。解析在有界Node子进程完成，返回后释放解析内存，避免大型参考表在业务主进程长期驻留。保存、就绪、运行和独立检查分别记录。
- 指定数据/参数/映射版本冻结后交现有真实calculation-worker。新来源用显式日profile和日0=2026-10-31；旧分钟原点不平移。构造式有限排程、日容量/已知停机/物理池、多层合格产出BOM、条件供给与缺料建议、模拟草稿和冻结CSV已有接缝；未排和错误如实保留，不宣称全局无解或全部按期。
- G01–05使用Test固定源的显式可替换仿真映射与20SF补充路线，经操作人员显式采用，不是现场默认。源Test文件只读保留；产品附带映射保留来源。
- 先吸收BOM源fa4b206090524538934ccc796c125f44bfe8dcad，再接主配置/API/真实Worker/装载守恒/保存重开/原生CSV。标准投入逐物料损耗与Excel合格产出已含收率profile分开；历史无新标识输入继续原模型。既有09原字段、历史run/plan和旧PASS不回填新模型。

## 版本与归属

复用唯一Dev活跃分支dev/b12-pack-batch-20261031，无新证据分支。起点main为48e0766d9733eff99f9bc3f0718639aab89fcf0e。固定BOM源挑取为caddfb2e59ab66613288c8e5e864e32fbba5e036；Test独立预期226a95b8cc199119f16f9bb50908c5aa3828d1af挑取为4effb92eef5fa3a323fcc7f8a54f48503c8c2cb8。均仅新增受派路径，与起点main改动交集0。完整本提交SHA/直接父、是否整合main和实际远端读回由同一交付记录提供，不用文档自引用SHA。

写共享文件前已登记Issue45评论6544251587，必要收率接缝追加6544461626/6544470387。Test独占bom-loss-policy/BomLossConfig/qa-bom-loss及qa/input-data-upgrade固定源未重写；BR13与MAX_LAG独占域未改。原main已有批准CR全部保留，新CR叠加登记。

## 当前精确阻断

开发验证期间Docker VM曾实测MemAvailable约488MB，整本解析/连续保存验证出现OOM终止；早期固定镜像没有python3，已用Node实现消除此依赖。完整35断言UI/API/Worker/持久化/重开/导出同候选证据仍缺，不得写整链PASS。解析中断返回明确错误，数据未原子提交。

已停止仅属于APS-Dev且已完成任务的四个旧自测容器以释放资源，保留原数据/证据；未操作历史QA、其他工作区、平台daemon或巡检。当前原包由PM协调足够的隔离验证容量，Dev在同一候选继续剩余断言；这不是业务待批或缺真实现场账。新的资源恢复信号后才重复受影响检查，不以重复无变化重试制造完成。

## 可复验入口

应用容器Node22；无需新增npm依赖。构建除原前后端bundle外还生成workbook-import-worker并复制schema/simulation JSON。完整类型检查、构建和已执行日志/限制由根交付报告逐项列出。

独立应用夹具：WORKBOOK_PRIVATE=1 WORKBOOK_STATE=独立目录 WORKBOOK_PRODUCT_SHA=固定SHA node --experimental-strip-types qa/workbook-dev-runtime.mjs，默认端口4320。仅操作隔离数据，沿产品shared访问政策，不伪称个人审批。浏览器UI须先构建；qa/pack-batch-ui-build.mjs的隔离root构建可用PACK_UI_DIST选择独立目录，不改已发布应用。

外部HTTP驱动：python3 qa/workbook-dev-http.py BASE_URL ORIGINAL.xlsx MUTATIONS_DIR OUTPUT_DIR。只发请求，不在宿主安装依赖或启动应用。负例由Test只读源qa/input-data-upgrade-mutations.py按固定原件生成。qa/workbook-dev-api.test.mjs同时提供真实Worker/BOM配置及精确数值检查；受限VM中应分开测试客户端和服务端，不把资源中断记为业务PASS。

后续完成条件仍是同一固定候选的35条矩阵及27条收口表、可运行入口与部署指纹、完整影响自验和独立预期；PM核入口后安排一次整链QA。未发布、未扩大DEC/P1/D3/B02、无真实采购外发。
