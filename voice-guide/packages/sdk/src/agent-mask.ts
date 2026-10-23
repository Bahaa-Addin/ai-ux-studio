/**
 * Masks personal data in page content before the agent sends it to a model
 * (ADR-0018). The agent proxy applies the same rules again on the server.
 */
export function maskContent(content: string): string {
	return content
		.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
		.replace(/(?<![\w\d])(?:\d[ -]?){13,19}(?![\w\d])/g, '[card]')
		.replace(/(?<![\w\d])(?:\+?20|0)1[0125]\d{8}(?![\w\d])/g, '[phone]')
}
