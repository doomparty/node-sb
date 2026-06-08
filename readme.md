一、 go.sh 支持的环境变量（控制代理行为）
这些变量决定了你的 sing-box (nginx) 如何运行。如果你在 PaaS 平台设置了这些变量，脚本会优先使用你设置的值；如果没有设置，则会使用脚本里写死的默认值。
环境变量名
作用说明
脚本内的默认值
建议配置方式
CF_TOKEN
Cloudflare Tunnel 的认证 Token。
用于连接 CF 边缘节点。
eyJhIjoi... (你脚本里那一长串)
强烈建议在 PaaS 中配置。不要硬编码在脚本里，以防 Token 泄露被他人恶意使用。
VMESS_UUID
VMESS 协议的用户 UUID。
客户端连接时必须匹配的密码。
ee1feada-4e2f-4dc3...
强烈建议重新生成一个并在 PaaS 中配置。默认的 UUID 已经暴露在代码中，任何人都可以白嫖你的代理。
VMESS_PORT
VMESS 在容器内部监听的本地端口。
44344
一般无需修改。除非该端口与容器内其他服务冲突。
VMESS_PATH
VMESS WebSocket 的伪装路径。
客户端连接时的 Path 参数。
/ray272449844
建议自定义修改（如 /my-secret-path），增加防探测能力。
HA_CONNECTIONS
Cloudflare Tunnel 的高可用并发连接数。
4
保持 4 即可。如果网络延迟高，可适当增加到 8 以提升吞吐量。
DOWNLOAD_DIR
二进制文件和日志的存放目录。
/tmp/myapp
无需修改。/tmp 是内存/临时文件系统，符合容器最佳实践。
二、 app.js 支持的环境变量（控制下载与部署）
这些变量由 Node.js 读取，用于控制文件的下载、解密以及 Web 服务的启动。
环境变量名
作用说明
默认值
必须配置？
GPG_PASSWORD
解密 go.sh.gpg 的密码。
无
必填 (或通过 Docker Secret 挂载)。
FILE_1_URL
nginx (sing-box) 二进制文件的下载直链。
https://example.com/download/nginx
必填。需指向你存放 static 版本二进制的 URL。
FILE_2_URL
go.sh.gpg 加密脚本的下载直链。
https://example.com/download/go.sh.gpg
必填。需指向你最新加密的脚本 URL。
PORT
Node.js Web 服务监听的端口（用于 PaaS 健康检查）。
5000
选填。PaaS 平台通常会自动注入此变量（如分配 8080），代码会自动适配。
