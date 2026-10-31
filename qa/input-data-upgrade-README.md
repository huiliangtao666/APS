# CR-INPUT-DATA-20261031 独立预期与仿真夹具

交付类型：独立预期/可重放夹具开发及自检。不是 Excel 解析器、持久化服务或替代 Worker。**本增量产品 SHA=null，IN-01～35 产品测试全部 NOT_EXECUTED，整包 NOT_READY，QA UAT 未执行。**

原 delivery：`dlv_a338ccb3-b546-46bf-986d-d161690a2b94`；结果 event_key：`dlv_a338ccb3-b546-46bf-986d-d161690a2b94:r1`；dispatch event_key：`design:input-data-upgrade:20261031:r1:Test`。前序 BOM 源 `fa4b206090524538934ccc796c125f44bfe8dcad` 已交 PM，保留原结论。

依据：[Issue45 当前登记](https://github.com/huiliangtao666/APS/issues/45#issuecomment-6543859215)，固定设计 `13e2eeed4438cb0b200db9c4de3781c7f1248be3` 下 `docs/requirements/proposals/CR-INPUT-DATA-20261031/r1/` 的原 Excel、02/03/04/05/06/09/12；PM业务合并版 SHA256 `d7a86d463b9e8003e9860b3f55e3d7d8e0ec408710647f74a62964500c3f98f8`。v0.3 FR/BR 身份、历史证据、旧09/10/11 PASS 不迁签；不把 IN 号变成旧 AC。

## 文件与入口

所有本次源文件均为 `qa/input-data-upgrade-*`，复用现有 Test 活跃分支；APS-Dev 串行整合 main。App/API/schema/持久化/run-input/Worker/导出/依赖和受控 CR 由 Dev 唯一写入。

- `source.json`：原件只读证据投影，带物理行和原公式/缓存字面。仅受控参数直接引用取原 E 列字面；其余公式保留为文本，oracle 不读取缓存计算。不是导入模型。原件29表、16输入/7参考/6说明图示、307字段/4129直引，原 hash 不变。
- `cases.json`：IN 独立数值算例，标明来源或仿真；不能成为现场默认。
- `oracle.py` / `expected.json`：Python Fraction 独立数量、单位、提前期、时间/资格预期；不导入 APS 算法，不运行公式或外链。140物料按真实 BOM 图及参考供货关系递推，不从累计期缓存取值。
- `sf-routes.csv` / `simulation.json`：G01–G05 显式单线、20SF的40工序、47个有限物理资源（原32设备+14工装及1台显式仿真SF设备）、班组/工装池、317条父项专属投料点和8批 WIP 余工序/包材责任。
- `matrix.csv`：保留05原文、35条独立预期/执行路径/唯一主收口；`closure.csv` 保留06的27条身份映射和剩余责任。IN-19 主收口#39，#38引用同一结果。
- `mutations.py`：从固定原件制作9个隔离副本。只替换指定 OOXML 条目；检查其余条目解压字节完全一致。副本用于真实产品导入，不是产品导入实现。
- `facts.json` / `verify.py`：固定候选的可比观测投影、证据hash检查入口。无产品观测时生成35项 NOT_EXECUTED，不能用独立算术自检代替产品执行。

这些小型标准库脚本无需安装依赖；可在宿主作数据核算。应用测试、依赖安装、浏览器/Worker仍必须在应用容器及隔离数据集内执行。

```sh
python3 qa/input-data-upgrade-oracle.py /tmp/input-oracle
python3 qa/input-data-upgrade-verify.py --selfcheck
python3 qa/input-data-upgrade-mutations.py /path/to/original.xlsx /tmp/input-variants
python3 qa/input-data-upgrade-verify.py --out /tmp/input-product-verdict.json
```

原 Excel 从上述固定设计 SHA 取得；1672626 bytes，SHA256 `c4c2d40b82fd63a60b7ebbe269aecd4208e49f1f612ee0164b963b948a8b56d0`。不要改原件或拿副本替换原 hash。

## 精确锚点和仿真边界

首窗[1,15)为11月1～14日，700行需求、65,464kg；十一月1500行，尾窗650行。日0/1相对旧11月2日08:00原点分别为-3360/-1920分钟，历史位移0。10成品累计期12/11/13/13/13/12/13/11/12/12，FG001参数PA0001由3改4后累计期12→13；旧运行保持原版。

BM001按1000kg合格产出基准，200kg需SF001 177.0833334kg；不可再除0.96。标准投入独立profile仍为650/150/150/50、生产损耗2/4/10/0%、O966/Y96.6%；T240投入26000/161、6000/161、6000/161、2000/161kg。原料/运输只保存说明，不进入该公式。

EQ007原日能力4000kg，日1周日减半至2000kg。四个同日500kg任务正好用满，第五个1kg必须延后/拆分或拒绝。跨日0仍有加工工作量及先后。TM02可同时20人，12+9=21超1人；两班不能变成40个同时可用的人。

SF第一道显式仿真同日投料使用原EG003，第二道用全20种共享的一台SIM-EQ-SF（批500kg/标准日1000kg/同时500kg），历时保留09模板已知1或2天；不是20套复制容量。该设备服务能力和映射均为可替换仿真，不是原Excel事实或用户默认。

投料业务名“调配混合”显式映射成品称量配料工序；“原料备料”映射首工序；SF映射仿真第一步；包材映射包装检验。保存映射版本，不依赖名称猜测。WIP原历史上游投料不再扣账；仿真明确包装尚未投料，按原BOM和200kg目标计算剩余包材，保留正余工序/人数/工装。原冷却资源占用[0,预计完工日)，日1仍占用4批，不把预计放行当已实现库存。数据/映射完整与有限资源可行性分别检查，未排需求必须解释，不能把全工作簿自动记可排程。

库存100/占用20/放行3/到期5：已放行状态日2/3/4/5为0/80/80/0，待检和冻结均0。到货4+检验2在日6才是条件供应，日4不可用，重试仅同一采购行。MOQ200/倍50：101→200、211→250。需料5/采购3/检验1/当前2：理论下单1，实际最早2，可用6，晚1天。参考草案不自动供给，采用/重试/作废沿唯一身份，不真实外发。

## 产品候选到达后的接续

Dev先交固定main SHA/父/影响、实际部署/冻结指纹、适用UI/API/Worker/持久化自验及真实导出。Test独立从GitHub取得该版本，仅补新增影响；不复测旧SHA同断言。先原件整本导入/四类维护，再9副本的原子拒绝与定位，最后显式G01–05补充→采用冻结→实际Worker→结果/缺料/模拟补单→保存重开/原生导出/独立检查。保留旧集/旧运行前后hash。

观测格式见 `observations.template.json`。填写实际 `product_sha`、`deployment_fingerprint`、`frozen_input_fingerprint`；每条写同一SHA、真实观察到的 `observed`，并列出矩阵要求的UI/API/Worker/persistence/history/export/independent-check原始证据相对路径及SHA256。不能把facts.json复制为实际结果；捕获后再独立比对。执行：

```sh
python3 qa/input-data-upgrade-verify.py --observations captures/actual.json --out captures/verdict.json
```

该入口只检查捕获值与证据hash，审阅者仍须核原始执行证据证明对应路径确实运行，不能将任意文件存在当链路已测。整卡Done/QA调度归PM；完整UAT确认归QA。必要能力不支持时统一阻断，最终整本验收不能长期靠NOT_SUPPORTED收口。没有固定候选/真实捕获时本入口保持 NOT_EXECUTED，而不是运行替代Worker或伪造PASS。
