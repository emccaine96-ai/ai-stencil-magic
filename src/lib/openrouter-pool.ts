export const openRouterConfig = {
    defaultModel: "openrouter/free", 
    fallbackModel: "openrouter/auto", 
    temperature: 0.15,
    maxTokens: 4096
};

export async function fetchOpenRouterCompletion(prompt: string, options = {}) {
    const apiKey = localStorage.getItem('openrouter_api_key') || process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("Missing Bring-Your-Own-Key configuration.");

    const response = await fetch("https://openrouter.ai", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://127.0.0.1:20128",
            "X-Title": "AI Stencil Magic"
        },
        body: JSON.stringify({
            model: options.model || openRouterConfig.defaultModel,
            messages: [{ role: "user", content: prompt }],
            temperature: options.temperature || openRouterConfig.temperature
        })
    });
    return response.json();
}
