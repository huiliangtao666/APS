# #141 一次受控依赖/窗口协调请求（未执行）

本次仅核官方资料和本工作区保留应用环境，未安装/下载wheel/拉镜像/求解/运行测试。
当前源不是完整工作簿功能，不将依赖准备当作交付门通过。

## 精确缺口

只读核现有 `praetor-app-APS-Dev-prod`，exact CID
`ce923890fc0b7489550948b8497f6579aec5d7685148b85af00e6842627111b7`：
Debian12 / Linux aarch64 / glibc2.36，Node22-slim；PATH中无python3、pip3。
直接读取python版本失败为 `executable file not found in $PATH`，未重试安装。
该CID只作依赖调查对象，不是拟安装目标，也不宣称当前候选部署。

OR-Tools官方PyPI 9.15.6755要求Python>=3.9，且依赖numpy/pandas/protobuf等；
Node包清单无OR-Tools，不能只加npm同名第三方wrapper冒充官方引擎。
目标锁为 **CPython3.11 / Linux aarch64 / glibc>=2.28**。11个base依赖及对应wheel SHA256已从PyPI元数据锁定，wheel总55,769,042 bytes；不含系统Python/展开空间。
`server/solver-choice/requirements-linux-aarch64-py311.lock` 是元数据锁，尚未pip解析/安装；不声称二进制已可加载。

## 请求PM一次协调的对象与动作

在Test2实际新用户任务释放且#147优先收口后，交本卡原owner一个独立、可销毁的**官方应用侧**构建/验证环境。
必须先确认平台支持在该新目标使用下述依赖层；现有app-exec `--validate`保证源码临时目录，不据此推定系统apt安装隔离。
若平台不能提供Python依赖层/自定义依赖构建目标，这是具体平台阻断；不在保留容器执行apt，不自行改平台daemon或假造发布配置。

提议依赖层源码 `server/solver-choice/Dockerfile.dependencies`：
1. 复用已存在本地官方Node镜像digest `node@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9`，不拉未知base。
2. 仅新目标安装Debian python3/python3-venv及ca-certificates，核主次版本3.11，创建 `/opt/aps-solver141/venv`。
3. 仅从官方PyPI安装固定hash、仅binary的11项锁；`pip check`并导入官方cp_model核版本。不得借他工作区SDK。
4. 得到新exactCID/镜像digest、解释器绝对路径、实际cgroup/依赖指纹后，将该依赖层供官方finite应用验证环境使用；不绑定或替换任何现有app。

核心安装命令（**提案，不是已执行命令**）：
```sh
python3 -m venv /opt/aps-solver141/venv
/opt/aps-solver141/venv/bin/python -m pip install --require-hashes --only-binary=:all: --no-cache-dir -r server/solver-choice/requirements-linux-aarch64-py311.lock
/opt/aps-solver141/venv/bin/python -m pip check
```

新增安装/实际求解预算当前0，本请求不消费#147额度。提议本卡600秒累计额度内分配：依赖准备最多180秒、native及定向自测最多180秒、工作簿/保存导出影响验证最多180秒、停止与交接预留60秒；每条命令<=180秒。
这只是请求上限，实际现有主链若无法在剩余额度完成则报具体未验，不自动续时。
生产运行的有效solver预算须从当前合同确认total/delivery/check预留及来源，不能把上述开发预算当生产默认。

运行前fresh门：PM跨owner事实、当前owner最终释放与0pending、节点可用>=2GiB、实际新目标cgroup至少2GiB且无OOM、全节点进程和原state/source/native/frozen/config/卷/历史输入保护。
单native线程复用现有运行槽；无持久candidate/preview/browser/Worker授权附带。首OOM/PID/保护漂移或<=256MiB立即停止，只终止本次可证明owned对象，不无变化重试。

## 恢复

源码保原短分支；依赖和验证写入新目标专属目录/无原数据挂载的临时副本。
失败时close/停止本次exact-owned负载并确认0pending，交原诊断和未验项；保留保护服务及原state/Excel/native/frozen。
仅清本次可重建临时环境，记录exactID、bytes及清理结果；不docker prune、不停旧18容器、不restart/发布/覆盖现有QA。

## 官方来源（2026-11-04读取）

- [Google官方安装](https://developers.google.com/optimization/install/python/binary_linux)
- [OR-Tools 9.15.6755发布元数据](https://pypi.org/pypi/ortools/9.15.6755/json)
- [官方CP-SAT Python接口](https://github.com/google/or-tools/blob/v9.15/ortools/sat/python/cp_model.py)

aarch64 CPython3.11 OR-Tools wheel 27,649,965 bytes，SHA256
`c3bcccd15ef3fc6ac10bfa11630ba6dfe437d4fd1374a5b33f4773b7fee0f877`。
其余10包hash见锁；元数据原件及选择依据在本delivery正式证据包中保留。
