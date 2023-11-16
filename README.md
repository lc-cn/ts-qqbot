ts-qqbot
# 安装依赖
```shell
npm i ts-qqbot # or yarn add ts-qqbot
```
# 使用
```js
const { Bot,Plugin } = require('ts-qqbot')
// 创建机器人
const bot=new Bot({
	appid: '', // qq机器人的appID (必填)
	token: '', // qq机器人的appToken (必填)
	secret: '', // qq机器人的secret (必填)
	sandbox: true, // 是否是沙箱环境 默认 false
	removeAt:true, // 移除第一个at 默认 false
	logLevel:'info', // 日志等级 默认 info
	maxRetry: 10, // 最大重连次数 默认 10
	intents: [
		'GROUP_AT_MESSAGE_CREATE', // 群聊@消息事件 没有群权限请注释
        'C2C_MESSAGE_CREATE', // 私聊事件 没有私聊权限请注释
        'GUILD_MESSAGES', // 私域机器人频道消息事件 公域机器人请注释
        'PUBLIC_GUILD_MESSAGES', // 公域机器人频道消息事件 私域机器人请注释
        'GUILD_MESSAGE_REACTIONS', // 频道消息表态事件
        'GUILDS', // 频道变更事件
        'GUILD_MEMBERS', // 频道成员变更事件
        'DIRECT_MESSAGE', // 频道私信事件
    ], // (必填)
})
// 创建插件
const testPlugin=new Plugin('test')
// 定义指令
testPlugin
	.command('/test')
	.action(()=>'hello world')
// 定义指令
testPlugin
    .command('/一言')
	.action(async()=>{
		const {data}=await axios.get('https://v1.hitokoto.cn/?encode=text')
		return data
	})
// 定义指令
testPlugin
    .command('/日记')
	.action(async()=>{
		const {data}=await axios.get('https://v2.api-m.com/api/dog')
		return data
	})
// 定义指令
testPlugin
    .command('/百科 <keyword:string>')
	.action(async(_,keyword)=>{
		const {data}=await axios.get(`https://baike.deno.dev/item/${encodeURIComponent(keyword)}?encoding=text`)
		return data
	})
// 引用插件
bot.use(testPlugin)
// 启动机器人
bot.start()
```
