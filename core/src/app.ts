import { EventEmitter } from 'events';
import { Logger, getLogger } from 'log4js';
import { Middleware } from '@/middleware';
import { Plugin, PluginMap } from '@/plugin';
import { Bot, Dict, LogLevel } from '@/types';
import { loadModule, remove } from '@/utils';
import { AppKey, Required } from '@/constans';
import path from 'path';
import { Adapter, AdapterBot, AdapterReceive } from '@/adapter';
import { Message } from '@/message';
import * as process from 'process';
import { Prompt } from '@/prompt';
export function defineConfig(config:App.Config):App.Config
export function defineConfig(initialFn:(env:typeof process.env & {mode:string})=>App.Config):(env:typeof process.env & {mode:string})=>App.Config
export function defineConfig(config:App.Config|((env:typeof process.env & {mode:string})=>App.Config)){
  return config
}
export class App extends EventEmitter {
  logger: Logger = getLogger(`[52bot]`);
  adapters: Map<string, Adapter> = new Map<string, Adapter>();
  middlewares: Middleware[] = [];
  plugins: PluginMap = new PluginMap();
  renders: Message.Render[] = [];

  constructor(public config: App.Options) {
    super();
    this.logger.level = config.logLevel;
    this.handleMessage = this.handleMessage.bind(this);
    this.on('message', this.handleMessage);
    return new Proxy(this, {
      get(target: App, key) {
        if (Reflect.has(target.services, key)) return Reflect.get(target.services, key);
        return Reflect.get(target, key);
      },
    });
  }

  registerRender(render: Message.Render) {
    this.renders.push(render);
    return () => remove(this.renders, render);
  }

  async renderMessage<T extends Message = Message>(template: string, message?: T) {
    for (const render of this.renders) {
      try {
        template = await render(template, message);
      } catch {
      }
    }
    return template;
  }

  initAdapter(adapter_names: string[]) {
    for (const name of adapter_names) {
      if (!name) continue;
      try {
        const adapter = Adapter.load(name);
        this.adapters.set(name, adapter);
        adapter.mount(this);
        this.logger.mark(`适配器： ${name} 已加载`);
      } catch (e) {
        this.logger.error(e);
      }
    }
  }

  middleware<T extends Adapter>(middleware: Middleware<T>) {
    this.middlewares.push(middleware as Middleware);
    return () => {
      remove(this.middlewares, middleware);
    };
  }

  get pluginList() {
    return [...this.plugins.values()].filter(p => p.status === 'enabled');
  }

  get commandList() {
    return this.pluginList.flatMap(plugin => plugin.commandList);
  }

  get services() {
    let result: App.Services = {};
    this.pluginList.forEach(plugin => {
      plugin.services.forEach((service, name) => {
        if (Reflect.ownKeys(result).includes(name)) return;
        Reflect.set(result, name, service);
      });
    });
    return result;
  }

  findCommand(name: string) {
    return this.commandList.find(command => command.name === name);
  }

  getSupportMiddlewares<A extends Adapter>(adapter: A, bot: AdapterBot<A>, event: Message<A>): Middleware[] {
    return this.pluginList.filter(plugin => !plugin.adapters || plugin.adapters.includes(adapter.name))
      .reduce((result, plugin) => {
        result.push(...plugin.middlewares);
        return result;
      }, [...this.middlewares]);
  }

  getSupportCommands<A extends Adapter>(adapter: A, bot: Bot<A>, event: Message<A>) {
    return this.pluginList.filter(plugin => !plugin.adapters || plugin.adapters.includes(adapter.name))
      .flatMap(plugin => plugin.commandList);
  }

  handleMessage<A extends Adapter>(adapter: A, bot: Adapter.Bot<AdapterBot<A>>, event: Message<A>) {
    const middleware = Middleware.compose(this.getSupportMiddlewares(adapter, bot, event));
    middleware(adapter, bot, event);
  }

  enable(name: string): this
  enable(plugin: Plugin): this
  enable(plugin: Plugin | string) {
    if (typeof plugin === 'string') {
      plugin = this.plugins.get(plugin)!;
      if (!plugin) throw new Error('尚未加载插件：' + plugin);
    }
    if (!(plugin instanceof Plugin)) throw new Error(`${plugin} 不是一个有效的插件`);
    plugin.status = 'enabled';
    return this;
  }

  disable(name: string): this
  disable(plugin: Plugin): this
  disable(plugin: Plugin | string) {
    if (typeof plugin === 'string') {
      plugin = this.plugins.get(plugin)!;
      if (!plugin) throw new Error('尚未加载插件：' + plugin);
    }
    if (!(plugin instanceof Plugin)) throw new Error(`${plugin} 不是一个有效的插件`);
    plugin.status = 'disabled';
    return this;
  }

  emit(event: string, ...args: any[]) {
    if (['plugin-beforeMount', 'plugin-mounted', 'plugin-beforeUnmount', 'plugin-unmounted'].includes(event)) {
      const plugin: Plugin = args[0];
      const method = event.split('-')[1];
      if (plugin && plugin['lifecycle'][method]?.length) {
        for (const lifecycle of plugin['lifecycle'][method]) {
          lifecycle();
        }
      }
    }
    const result = super.emit(event, ...args);
    for (const plugin of this.pluginList) {
      plugin.emit(event, ...args);
    }
    return result;
  }

  use(init: Plugin.InstallObject, config?: Plugin.Options): this
  use(init: Plugin.InstallFn, config?: Plugin.Options): this
  use(init: Plugin.InstallObject | Plugin.InstallFn, config?: Plugin.Options): this {
    let name = typeof init === 'function' ? this.plugins.generateId : init.name || this.plugins.generateId;
    const plugin = new Plugin(name, config);
    const initFn = typeof init === 'function' ? init : init.install;
    this.mount(plugin);
    try {
      initFn(plugin);
      return this;
    } catch (e) {
      this.logger.error(`插件：${name} 初始化失败`,e);
      return this.unmount(plugin);
    }
  }

  mount(name: string): this
  mount(plugin: Plugin): this
  mount(plugin: Plugin | string) {
    if (typeof plugin === 'string') {
      plugin = loadModule(plugin);
    }
    if (!(plugin instanceof Plugin)) return this.use(plugin as any);
    this.emit('plugin-beforeMount', plugin);
    this.plugins.set(plugin.name, plugin);
    plugin[AppKey] = this;
    plugin.mounted(()=>{
      for (const [name, service] of (plugin as Plugin).services) {
        this.emit('service-register', name, service);
      }
      this.logger.info(`插件：${ (plugin as Plugin).name} 已加载。`);
    })
    if(plugin[Required].length){
      const requiredServices=plugin[Required]
      const mountFn=()=>{
        if(requiredServices.every(s=>{
          return !!this[s]
        })) this.emit('plugin-mounted',plugin)
      }
      const serviceDestroyListener=(name:string)=>{
        if(requiredServices.some(s=>{
          return name===s
        })) this.emit('plugin-beforeUnmount',plugin)
      }
      this.on('service-register',mountFn)
      this.on('service-destroy',serviceDestroyListener)
      plugin.beforeUnmount(()=>{
        this.off('service-register',mountFn)
        this.off('service-destroy',serviceDestroyListener)
      })
      mountFn()
    }else{
      this.emit('plugin-mounted', plugin);
    }
    return this;
  }

  unmount(name: string): this
  unmount(plugin: Plugin): this
  unmount(plugin: Plugin | string) {
    if (typeof plugin === 'string') {
      plugin = this.plugins.get(plugin)!;
    }
    if (!(plugin instanceof Plugin)) {
      this.logger.warn(`${plugin} 不是一个有效的插件，将忽略其卸载。`);
      return this;
    }
    if (!this.plugins.has(plugin.name)) {
      this.logger.warn(`${plugin} 尚未加载，将忽略其卸载。`);
      return this;
    }
    this.emit('plugin-beforeUnmount', plugin);
    this.plugins.delete(plugin.name);
    plugin[AppKey] = null;
    for (const [name, service] of plugin.services) {
      this.emit('service-destroy', name, service);
    }
    this.logger.info(`插件：${plugin.name} 已卸载。`);
    this.emit('plugin-unmounted', plugin);
    return this;
  }

  async start() {
    this.initAdapter(this.config.adapters);
    for (const [name, adapter] of this.adapters) {
      adapter.emit('start');
      this.logger.info(`适配器： ${name} 已启动`);
    }
    this.emit('start');
  }

  loadPlugin(name: string):this {
    const maybePath = [
      ...(this.config.pluginDirs || []).map((dir) => {
        return path.resolve(process.cwd(),dir,name)
      }), // 用户自己的插件
      path.resolve(__dirname,'plugins',name), // 内置插件
      path.resolve(process.cwd(),'node_modules',name) //社区插件
    ];
    let loaded:boolean=false,error:unknown;
    for(const loadPath of maybePath){
      if(loaded) break;
      try{
        this.mount(loadPath)
        loaded=true
      }catch (e){
        error=e
        this.logger.debug(`try load plugin(${name}) failed. (from: ${loadPath})`)
      }
    }
    if(!loaded) this.logger.warn(`load plugin "${name}" failed`,error)
    return this
  }

  stop() {

  }
}

export interface App extends App.Services {
  on<T extends keyof App.EventMap>(event: T, listener: App.EventMap[T]): this;

  on<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>, listener: (...args: any[]) => any): this;

  off<T extends keyof App.EventMap>(event: T, callback?: App.EventMap[T]): this;

  off<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>, callback?: (...args: any[]) => void): this;

  once<T extends keyof App.EventMap>(event: T, listener: App.EventMap[T]): this;

  once<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>, listener: (...args: any[]) => any): this;

  emit<T extends keyof App.EventMap>(event: T, ...args: Parameters<App.EventMap[T]>): boolean;

  emit<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>, ...args: any[]): boolean;

  addListener<T extends keyof App.EventMap>(event: T, listener: App.EventMap[T]): this;

  addListener<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>, listener: (...args: any[]) => any): this;

  addListenerOnce<T extends keyof App.EventMap>(event: T, callback: App.EventMap[T]): this;

  addListenerOnce<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>, callback: (...args: any[]) => void): this;

  removeListener<T extends keyof App.EventMap>(event: T, callback?: App.EventMap[T]): this;

  removeListener<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>, callback?: (...args: any[]) => void): this;

  removeAllListeners<T extends keyof App.EventMap>(event: T): this;

  removeAllListeners<S extends string | symbol>(event: S & Exclude<string | symbol, keyof App.EventMap>): this;

}

export namespace App {
  export interface Options {
    adapters: string[];
    configFile?:string;
    pluginDirs: string[];
    logLevel: LogLevel;
  }

  export const adapters: Map<string, Adapter> = new Map<string, Adapter>();

  export interface EventMap {
    'start'(): void;

    'plugin-beforeMount'(plugin: Plugin): void;

    'plugin-mounted'(plugin: Plugin): void;

    'plugin-beforeUnmount'(plugin: Plugin): void;

    'plugin-unmounted'(plugin: Plugin): void;
    'ready'():void
    'message': <AD extends Adapter>(adapter: AD, bot: AdapterBot<AD>, message: AdapterReceive<AD>) => void;
    'service-register': <T extends keyof App.Services>(name: T, service: App.Services[T]) => void;
    'service-destroy': <T extends keyof App.Services>(name: T, service: App.Services[T]) => void;
  }

  export interface Config {
    plugins: string[] | Dict | ({ name: string, enable?: boolean, options?: any })[];
  }

  export interface Services {

  }
}
