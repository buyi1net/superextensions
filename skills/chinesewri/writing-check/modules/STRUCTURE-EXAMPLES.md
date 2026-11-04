# 骨架重组与反例参考

本参考模块汇总常见的英文骨架反例与重写后的合格对照,用于质检翻译腔和句法缺陷时对照参考.

## 一、词对词直译

- 原文: It opens each URL, says exactly what to click and copy, and captures the values.
- 不合格(词对词): 它替人打开每个 URL,提示点哪里,复制什么,再捕获值.
- 合格(骨架重组后): 向导会逐个打开 URL,说明该点什么地方,复制什么信息,最后记录取得的值.

## 二、从句一句到底

- 原文: If you encounter an error while the system is processing your request, you should check the log file that was created when the application started.
- 不合格(从句一句到底): 如果你在系统正在处理你的请求时遇到一个错误,你应该检查那个在应用启动时被创建的日志文件.
- 合格(拆句): 系统处理请求时出错,就查日志文件;这份文件在应用启动时生成.

## 三、结论裸奔与过度压缩

- 原文: Apply the deletion test to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.
- 不合格(结论裸奔+压缩过头): 对疑似浅的模块做删除测试:删掉它,复杂度能收拢到一处,还是只是挪个位置?答「能收拢」才是你要的信号.
- 合格(逻辑链摊开): 凡是看着像浅模块的,都拿删除测试验一验:假想删掉它,复杂度是能收拢到一处,还是只是挪个地方?能收拢,说明这些复杂度背后有个该收留它们的深模块,并进去就是一次真正的深化,值得记进候选;只是挪地方的话,复杂度换个地方继续散着,这活就白干了.

## 四、词都对但骨架是英文

- 原文: Each lesson should recommend a primary source for the user to read or watch. This should be the most high-quality, high-trust resource you found on the topic.
- 不合格(词全对了,骨架还是英文): 每课给用户推荐一个一手来源去读去看:你在这个主题上找到的质量最高,最可信的那个资源.
- 合格(合上重说): 每节课推荐一份一手的阅读或观看材料,挑你在这个话题下能找到的质量最高,最信得过的资源.
