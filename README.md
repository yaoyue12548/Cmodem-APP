# Air6 APP

SoftBank Air6 的 Android 管理客户端，适配 OpenWrt / LuCI cmodem。当前版本 **1.4.3-local-52**。

连接设备网络，填写管理地址、账号和密码即可使用。默认地址通常是 `192.168.1.1`，账号通常是 `root`。账号和密码加密保存在手机本地，无需注册云端账号。

## 功能

- 查看信号、载波、小区、网速、流量、CPU、内存、温度和设备版本。
- 设置网络模式、频段、小区锁定和 Wi-Fi。
- 短信会话、收发、复制、删除，以及转发和存储设置。
- 编辑定时任务，设置锁频或小区断网后的自动回退。
- 查看 WAN、DHCP 租约，检查和管理设备固件 OTA。

前台按设置的 **3 / 5 / 8 秒**刷新，实时网速每 **1 秒**采样。短信自动刷新默认开启，后台暂停，无操作不降频。慢请求不会重复堆积；正在编辑的内容不会被刷新覆盖。

不同固件支持的接口可能不同，详见 [Air6 适配说明](docs/AIR6_ADAPTATION.md)。

## 本次更新

修复“当前已是最新版本”时仍显示“可用更新”的问题。现在只有发现新固件才显示卡片和红点；平时可以点“我的 → 系统版本”进入更新页面。

[更新说明](docs/SOURCE.md) · [本版验证记录](docs/VERIFICATION-local-52.md)

## 构建

环境：JDK 17 或 21、Android SDK Platform 37.0、Build Tools 35.0.0、NDK 28.2.13676358。

使用 Android Studio 打开项目并设置 SDK 路径，或通过 `ANDROID_HOME` 指定 SDK。Windows 命令：

```powershell
.\gradlew.bat assembleDebug testDebugUnitTest lintDebug
```

首次构建需要下载依赖。调试 APK 位于 `app/build/outputs/apk/debug/`，包名为 `com.fhcpeboard.android.debug`。

JavaScript 测试需要 Node.js 22 或更新版本：

```powershell
npm ci --prefix tools
node --test --test-timeout=10000 tests/lan*.test.cjs
```

正式版包名为 `com.fhcpeboard.android`，构建命令为 `.\gradlew.bat assembleRelease`。签名配置从 `FHCPE_KEYSTORE_PROPS` 指向的文件读取，默认位置是项目上一级的 `release-signing/keystore.properties`：

```properties
storeFile=D:/signing/release.jks
storePassword=你的密钥库密码
keyAlias=release
keyPassword=你的密钥密码
```

没有签名配置时生成未签名包。覆盖安装必须使用原来的签名；仓库不包含签名文件、APK、设备密码或本机 SDK。

## iOS 云构建

仓库包含 iOS 容器移植和 GitHub Actions 工作流。推送 iOS 源码后，或在 GitHub 的 Actions 页面手动运行 `iOS IPA`，macOS runner 会构建并上传 `FHCpeBoard-unsigned-IPA` 工件。当前工件未签名，安装到 iPhone 前需要使用 Apple 开发者证书签名；工作流本身不需要提交证书。

iOS 版本复用同一套页面和设备协议，通过 WKWebView、Keychain、URLSession 和 Photos Picker 提供平台能力。当前设备操作需要 iOS 允许本地网络访问；设备使用 HTTP 时由应用网络层访问。Xcode 构建和真机验证由 macOS runner / Apple 设备完成，本地 Windows 环境不能执行这些检查。

## 目录

| 目录 | 内容 |
| --- | --- |
| `app/src/main/java` | Android 容器、网络请求、WebView 桥接和本地存储 |
| `app/src/main/assets` | 页面、设备接口、短信和刷新逻辑 |
| `app/src/main/cpp` | 短信 PDU 解码 |
| `tests` | 接口、页面和刷新测试 |
| `tools` | 资源处理、预览及固定的上游测试基线 |
| `docs` | 适配和验证记录 |

## 来源

导入版本和文件校验值保存在 `docs/upstream-*-manifest.json` 中。

上游未声明许可证，本仓库也暂未添加许可证；需要复用或再分发相关代码时，请先确认原作者的授权。
