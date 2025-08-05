import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";

export function registerRecraftSVGTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        "generate_svg",
        {
            prompt: z.string().min(1, "Prompt is required"),
            aspect_ratio: z.enum([
                "Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", 
                "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"
            ]).optional().default("Not set"),
            size: z.enum([
                "1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536",
                "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024",
                "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"
            ]).optional().default("1024x1024"),
            style: z.enum([
                "any", "engraving", "line_art", "line_circuit", "linocut"
            ]).optional(),
        },
        async ({ prompt, aspect_ratio, size, style }) => {
            // Retrieve Bearer token using the provided function
            const apiKey = await getBearerToken();
            console.log("Tool execution - Bearer token retrieved:", apiKey ? "[present]" : "[missing]");
            
            if (!apiKey) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: Replicate API key not available. Please provide a valid Bearer token in the Authorization header."
                        }
                    ],
                };
            }

            try {
                const replicate = new Replicate({
                    auth: apiKey,
                });

                const input: any = {
                    prompt,
                    size,
                    aspect_ratio,
                };

                if (style) {
                    input.style = style;
                }

                const output = await replicate.run("recraft-ai/recraft-v3-svg", { input });

                return {
                    content: [
                        {
                            type: "text",
                            text: `SVG generated successfully! URL: ${output}`
                        }
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error generating SVG: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ],
                };
            }
        }
    );
}