import { Bot } from "..";
import { Contactable } from "./contactable";
import { User } from "./user";
const guildMemberCache: WeakMap<GuildMember.Info, GuildMember> = new WeakMap<GuildMember.Info, GuildMember>()
export class GuildMember extends Contactable {
    constructor(bot: Bot, guild_id: string, public info: GuildMember.Info) {
        super(bot)
        this.guild_id = guild_id
        this.user_id = info.user?.id
    }
    static from(this: Bot, guild_id: string, memebr_id: string) {
        const guildMemberMap = this.guildMembers.get(guild_id)
        if (!guildMemberMap) throw new Error(`未找到关于guild(${guild_id})的成员。(注：公域机器人无法获取频道成员列表)`)
        const memberInfo = guildMemberMap.get(memebr_id)
        if (!memberInfo) throw new Error(`guild(${guild_id}) member(${memebr_id}) is not exist`)
        if (guildMemberCache.has(memberInfo)) return guildMemberCache.get(memberInfo)
        const member = new GuildMember(this, guild_id, memberInfo)
        guildMemberCache.set(memberInfo, member)
        return member
    }
    async addRoles(role_id:string,channel_id:string){
        const result=await this.bot.request.put(`/guilds/${this.guild_id}/members/${this.user_id}/roles/${role_id}`,{id:channel_id})
        return result.status===204
    }
    async removeRoles(role_id:string,channel_id:string){
        const result=await this.bot.request.delete(`/guilds/${this.guild_id}/members/${this.user_id}/roles/${role_id}`,{data:{id:channel_id}})
        return result.status===204
    }
}
export namespace GuildMember {
    export interface Info {
        user: User.Info
        nick: string
        roles: string[]
        join_time: number
    }
}