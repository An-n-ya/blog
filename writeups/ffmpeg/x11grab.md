---
layout: doc
outline: deep
public: false
---

# x11grab
x11grab 是 ffmpeg 中的一个用来录制屏幕的小工具，它是以类似 demuxer 的形式接入 ffmpeg，是一个很好的用来学习 ffmpeg 和 X11 接口的学习材料，本文来学习下它的源码。

<!-- intro -->

## 使用方法
```sh
> ffmpeg -video_size 1024x768 -framerate 25 -f x11grab -i :0+100,100 output.mp4
```
- `-f`: TODO
- `-i :0+100,100`: 设置录制范围，:0 表示 0 号 DISPLAY，+100,100 表示 offset

按`Ctrl+c`就能结束录制，ffmpeg 在收到 SIGTERM 的时候会自动调用相关编码器和封装器完成 mp4 的封装工作。值得注意的是，这里录制出来的视频似乎不能被 VLC 播放（TODO：原因？），但 ffplay 是可以播放的。

## 源码分析
x11grab 工具的源码位于 libavdevice 中，老版本的 ffmpeg 同时支持 Xlib 和 Xcb 两种接口，所以老版本会有两个文件`x11grab.c`和`xcbgrab.c`，但新版本删除了 x11grab.c 只剩下 xcbgrab.c，但工具的名字还是叫作 x11grab。

xcbgrab 抓取屏幕的关键函数是`xcb_get_image`，它在 xcbgrab_frame 函数中被调用，这个函数将被 read_packet 函数反复调用，而 read_packet 函数就是 FFInputFormat 中获取数据的接口。

为了保证帧率匹配用户的设置值，还需要 read_packet 中等待一段时间。
TODO: 阻塞的代码
