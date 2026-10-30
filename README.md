# 星夜巴士主题 · Starry Bus Theme (`local.starry-bus-theme`)

根据「星夜积雨云、复古大众小巴士与阳光草坡」插画定制的 PI-Desktop 双模式毛玻璃主题包，支持**跟随操作系统深浅色自动切换「夜空版」与「云昼版」**。

## 核心特性

1. **跟随系统深浅色自动切换 (`starry-bus-auto` / `themeMode: "auto"`)**
   - 实时检测操作系统深色/浅色状态（Windows 注册表 `AppsUseLightTheme` / macOS `AppleInterfaceStyle` / Linux `gsettings`）：
     - 当操作系统处于 **深色模式 (Dark)** 时，自动切换为 **「星夜巴士 · 夜空版 (Starry Bus Night)」**；
     - 当操作系统处于 **浅色模式 (Light)** 时，自动切换为 **「星夜巴士 · 云昼版 (Starry Bus Day)」**。
   - 同时支持在插件面板或命令面板中手动固定为「夜空版」或「云昼版」。

2. **插画色彩体系与毛玻璃视觉**
   - **星夜巴士 · 夜空版 (`starry-bus-night`, Dark)**：提取左上深邃夜空靛蓝 `#061220`、积雨云高光白 `#EEF5FB`、复古巴士晴空蓝 `#4DA6E8`、阳光草坡暖金 `#F0B85A` 与草丛萤火虫翠绿 `#52D186`。
   - **星夜巴士 · 云昼版 (`starry-bus-day`, Light)**：提取巨型积雨云的明亮日光白 `#F4F8FC` 与晴空浅蓝 `#E8F1F9`，搭配深海蓝 `#0D2338` 高对比正文与 `#246FA8` 巴士蓝强调色。
   - **全屏插画背景层 (`.app-scenic-backdrop`)**：自动将随包附带的插画壁纸同步至插件数据目录并挂载至背景层，配合侧栏、顶栏、输入框和消息气泡的毛玻璃 (`backdrop-filter: blur`) 效果。
