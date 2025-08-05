import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";

export function registerRecraftSVGTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        "generate_svg",
        "Generates high-quality SVG vector graphics using Recraft V3 AI model. Use this tool when you need to create scalable vector illustrations, icons, logos, or artistic designs from text descriptions. Requires a valid Replicate API key provided via Bearer token authentication. Returns a URL to the generated SVG file that can be downloaded or embedded. Supports various aspect ratios, sizes, and artistic styles for different use cases.",
        {
            prompt: z.string().min(1, "Prompt is required").describe("Detailed text description of the SVG image to generate. Be specific about style, colors, composition, and visual elements you want to include"),
            aspect_ratio: z.enum([
                "Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", 
                "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"
            ]).optional().default("Not set").describe("The aspect ratio of the generated SVG. Common ratios: '1:1' for square, '16:9' for widescreen, '4:3' for standard. Default is 'Not set' which lets the AI choose"),
            size: z.enum([
                "1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536",
                "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024",
                "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"
            ]).optional().default("1024x1024").describe("The pixel dimensions of the generated SVG. Format is 'WIDTHxHEIGHT'. Default is '1024x1024' for square images. Choose larger sizes for higher detail"),
            style: z.enum([
                "any", "engraving", "line_art", "line_circuit", "linocut"
            ]).optional().describe("The artistic style to apply to the SVG. Options: 'any' for default style, 'engraving' for engraved look, 'line_art' for clean line drawings, 'line_circuit' for circuit-board style, 'linocut' for linocut print style. Optional parameter"),
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