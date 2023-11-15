import { Bot } from "..";

export async function reloadGuilds(this:Bot){
    this.guilds.clear()
    const _getGuildList = async (after: string = undefined) => {
        const res = await this.request.get('/users/@me/guilds', {
            params: {
                after
            }
        })
        if (!res.data?.length) return []
        const result = (res.data || []).map(g => {
            const { joined_at, ...guild } = g
            return {
                join_time: new Date(joined_at).getTime() / 1000,
                ...guild
            }
        })
        const last = result[result.length - 1]
        return [...result, ...await _getGuildList(last.id)]
    }
    for(const guild of await _getGuildList()){
        this.guilds.set(guild.id,guild)
    }
}
export async function reloadChannels(this:Bot,guild_id:string){
    for(const [_,channel] of this.channels){
        if(channel.guild_id===guild_id) this.channels.delete(channel.id)
    }
    const {data:result=[]} = await this.request.get(`/guilds/${guild_id}/channels`)
    for(const channel of result){
        this.channels.set(channel.id,channel)
    }
}
export async function relaodGuildMembers(this:Bot,guild_id:string) {
    const memberMap=this.guildMembers.get(guild_id) || new Map()
    memberMap.clear()
    const _getGuildMemberList = async (after: string = undefined) => {
        const res = await this.request.get(`/guilds/${guild_id}/members`, {
            params: {
                after,
                limit: 100
            }
        }).catch(()=>({data:[]}))// 公域没有权限，做个兼容
        if (!res.data?.length) return []
        const result = (res.data || []).map(m => {
            const { id: member_id, role, join_time, ...member } = m
            return {
                member_id,
                role,
                join_time: new Date(join_time).getTime() / 1000,
                ...member
            }
        })
        const last = result[result.length - 1]
        return [...result, ...await _getGuildMemberList(last.user?.id)]
    }
    for(const member of await _getGuildMemberList()){
        memberMap.set(member.id,member)
    }
    if(!this.guildMembers.has(guild_id)) this.guildMembers.set(guild_id,memberMap)
}