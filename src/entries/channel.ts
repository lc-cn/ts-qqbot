import { ChannelSubType, ChannelType, PrivateType, SpeakPermission } from "@/constans";
import { Contactable } from "./contactable";
import { Bot, Message, Quotable, Sendable } from "..";
const channelCache: WeakMap<Channel.Info, Channel> = new WeakMap<Channel.Info, Channel>()
export class Channel extends Contactable {
    constructor(bot:Bot,public info:Channel.Info){
        super(bot)
        this.guild_id=info.guild_id
        this.channel_id=info.id
    }
    static from(this: Bot, channel_id: string) {
        const channelInfo = this.channels.get(channel_id)
        if (!channelInfo) throw new Error(`channel(${channel_id}) is not exist`)
        if (channelCache.has(channelInfo)) return channelCache.get(channelInfo)
        const channel = new Channel(this, channelInfo)
        channelCache.set(channelInfo, channel)
        return channel
    }
    async sendMessage(message:Sendable,source?:Quotable){
        const { hasMessages, messages, brief, hasFiles, files } = Message.format.call(this.bot, message, source)
        let message_id = ''
        if (hasMessages) {
            let { data: { id } } = await this.bot.request.post(`/channels/${this.channel_id}/messages`, messages)
            message_id = id
        }
        if (hasFiles) {
            console.log(files)
            let { data: { id } } = await this.bot.request.post(`/channels/${this.channel_id}/files`, files)
            if (message_id) message_id = `${message_id}|`
            message_id = message_id + id
        }
        this.bot.logger.info(`send to Guild(${this.guild_id})Channel(${this.channel_id}): ${brief}`)
        return {
            message_id,
            timestamp: new Date().getTime() / 1000
        }
    }
    async update(updateInfo: Partial<Pick<Channel.Info, 'name' | 'position' | 'parent_id' | 'private_type' | 'speak_permission'>>):Promise<Channel.Info>{
        const { data: result } = await this.bot.request.patch(`/channels/${this.channel_id}`, updateInfo)
        return result
    }
    async delete(){
        const result = await this.bot.request.delete(`/channels/${this.channel_id}`)
        return result.status === 200
    }
}
export namespace Channel {
    export interface Info {
        id: string
        guild_id: string
        name: string,
        type: ChannelType
        sub_type: ChannelSubType
        position: number
        parent_id?: string
        owner_id: string
        private_type: PrivateType
        speak_permission: SpeakPermission
        application_id?: string
        permissions?: string
    }
}