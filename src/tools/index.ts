import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRecraftSVGTool } from "./recraft-svg.js";

interface Env {
    REPLICATE_API_TOKEN: string;
}

export function registerAllTools(server: McpServer, env: Env) {
    registerRecraftSVGTool(server, env);
}