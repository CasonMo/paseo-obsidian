/** 插件标识：复用 Obsidian 紫色晶体图形（指示性使用，仅表明兼容对象，见 OVERVIEW 声明）+ 右下角 Paseo 平台标识。
 *  菜单 inline SVG 不允许嵌 raster（href 仅限同文档 fragment），故晶体为矢量描摹、Paseo 徽标为矢量近似。 */
export const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<defs>
<linearGradient id="pobs-f1" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#DDD6FE"/><stop offset="1" stop-color="#A78BFA"/>
</linearGradient>
<linearGradient id="pobs-f2" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#A78BFA"/><stop offset="1" stop-color="#8B5CF6"/>
</linearGradient>
<linearGradient id="pobs-f3" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7C3AED"/><stop offset="1" stop-color="#6D28D9"/>
</linearGradient>
<linearGradient id="pobs-f4" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#6D28D9"/>
</linearGradient>
</defs>
<g stroke-linejoin="round">
<path d="M15.5 1.3 L9 5 L8 9.3 L14.3 13 C15 9 16.5 5 15.5 1.3 Z" fill="url(#pobs-f1)" stroke="url(#pobs-f1)" stroke-width="0.6"/>
<path d="M15.5 1.3 L19.5 6.3 L19.7 9.7 L21.7 13.7 L19.5 18.7 C17 15.5 15.5 14 14.3 13 C15 9 16.5 5 15.5 1.3 Z" fill="url(#pobs-f2)" stroke="url(#pobs-f2)" stroke-width="0.6"/>
<path d="M8 9.3 L5.3 15 L10 19.3 L14.3 13 Z" fill="url(#pobs-f3)" stroke="url(#pobs-f3)" stroke-width="0.6"/>
<path d="M14.3 13 C15.5 14 17 15.5 19.5 18.7 L16.7 20.7 L10 19.3 Z" fill="url(#pobs-f4)" stroke="url(#pobs-f4)" stroke-width="0.6"/>
</g>
<rect x="14" y="14" width="9.5" height="9.5" rx="2.4" fill="#000000"/>
<path d="M16.4 20.2 C15.4 18.8 16.3 16.9 17.8 17.4 C19.2 17.9 18.8 19.8 17.6 20 C19 20.2 20.4 19.4 20.8 18 C21.1 17 20.4 16.2 19.6 16.6" fill="none" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round"/>
</svg>`;