// Module shapes page-agent's sources expect from their own bundler setup.
declare module 'chalk' {
	const chalk: any
	export default chalk
}
declare module '*?raw' {
	const text: string
	export default text
}
declare module '*.module.css' {
	const classes: Record<string, string>
	export default classes
}
declare module '*.svg' {
	const url: string
	export default url
}
declare module 'ai-motion' {
	// Used as a value and a type by page-agent's mask, which the SDK bundle stubs out.
	export class Motion {
		[key: string]: any
		constructor(...args: any[])
	}
}
