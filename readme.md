# 🚀 Secure Sing-Box PaaS Executor

一个企业级、高安全性的 Node.js 自动化部署项目。专为 PaaS (Platform as a Service) 和 Docker 容器环境设计，用于安全下载、内存解密并后台启动 `sing-box` (伪装为 nginx) 代理服务。

## ✨ 核心特性

- **🔒 极致安全**：核心启动脚本 (`go.sh`) 使用 GPG 加密传输，密码通过 `stdin` 管道注入，彻底杜绝进程列表 (`ps aux`) 密码泄露。
- **🧠 内存管道执行**：解密后的脚本直接在 Node.js 内存管道中执行，配置文件使用进程替换 `<(...)`，全程**不落盘**，阅后即焚。
- **🛡️ PaaS 防超时护盾**：内置智能超时接管机制，完美适配 Render/Railway 等平台的严格健康检查与启动超时限制。
- **🔄 跨平台兼容**：自动过滤 Windows (`CRLF`) 换行符，兼容 Alpine/Debian 等多种底层容器环境。
- **⚡ 并发与容错**：双文件并发下载，自带网络重定向追踪与超时清理机制。

---

## ⚙️ 环境变量配置

本项目通过环境变量实现高度可配置化。分为**代理脚本层**和 **Node.js 部署层**两部分。

### 一、 代理脚本层 (`go.sh`)
这些变量决定了 `sing-box` 的运行行为。若在 PaaS 平台配置，将**优先覆盖**脚本内的硬编码默认值。

| 环境变量名 | 作用说明 | 脚本内默认值 | 配置建议 |
| :--- | :--- | :--- | :--- |
| **`CF_TOKEN`** | Cloudflare Tunnel 的认证 Token，用于连接 CF 边缘节点。 | `eyJhIjoi...` (长字符串) | ⚠️ **强烈建议在 PaaS 中配置**。切勿硬编码在代码中，防止 Token 泄露被恶意接管隧道。 |
| **`VMESS_UUID`** | VMESS 协议的用户 UUID，客户端连接时的核心鉴权密码。 | `ee1feada-4e2f...` | ⚠️ **强烈建议重新生成**。默认 UUID 若暴露在公网，任何人皆可白嫖您的代理流量。 |
| **`VMESS_PORT`** | VMESS 在容器内部监听的本地 TCP 端口。 | `44344` | 一般无需修改。除非该端口与容器内其他服务冲突。 |
| **`VMESS_PATH`** | VMESS WebSocket 的伪装路径 (客户端 Path 参数)。 | `/ray272449844` | 建议自定义修改（如 `/my-secret-api`），增加防主动探测能力。 |
| **`HA_CONNECTIONS`** | Cloudflare Tunnel 的高可用并发连接数。 | `4` | 保持 `4` 即可。若网络延迟较高，可增至 `8` 以提升吞吐量。 |
| **`DOWNLOAD_DIR`** | 二进制文件和临时配置的存放目录。 | `/tmp/myapp` | 无需修改。`/tmp` 符合容器无状态最佳实践。 |

### 二、 Node.js 部署层 (`app.js`)
这些变量由 Node.js 读取，用于控制文件的下载、解密以及 Web 健康检查服务的启动。

| 环境变量名 | 作用说明 | 默认值 | 必须配置？ |
| :--- | :--- | :--- | :--- |
| **`GPG_PASSWORD`** | 解密 `go.sh.gpg` 脚本的对称加密密码。 | 无 | ✅ **必填** (或通过 Docker Secret 挂载至 `/run/secrets/gpg_pass`)。 |
| **`FILE_1_URL`** | `nginx` (sing-box static 版本) 二进制文件的下载直链。 | `https://example...` | ✅ **必填**。需指向您存放二进制文件的可靠 CDN/OSS 链接。 |
| **`FILE_2_URL`** | `go.sh.gpg` 加密脚本的下载直链。 | `https://example...` | ✅ **必填**。需指向您最新加密的启动脚本 URL。 |
| **`PORT`** | Node.js Web 服务监听的端口（用于响应 PaaS 健康检查）。 | `5000` | ❌ **选填**。PaaS 平台通常会自动注入此变量（如 `8080`），代码会自动适配。 |

---

## 🚀 快速部署指南

### 1. 准备加密文件
在本地使用 GPG 对您的启动脚本进行加密：
```bash
gpg -c --cipher-algo AES256 go.sh
# 输入密码后，将生成的 go.sh.gpg 和 sing-box 二进制文件上传至您的文件服务器
