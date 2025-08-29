import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";

/**
 * MCP Tool Return Content Types 工具返回内容类型
 * 
 * MCP 支持 5 种不同的 content 类型：
 * 
 * 1. Text Content (文本内容) - 最常用
 *    { type: "text", text: string }
 * 
 * 2. Image Content (图片内容) - 用于返回图片数据
 *    { type: "image", data: string, mimeType: string }
 * 
 * 3. Audio Content (音频内容) - 用于返回音频数据  
 *    { type: "audio", data: string, mimeType: string }
 * 
 * 4. Resource Content (嵌入式资源) - 直接嵌入资源内容
 *    { type: "resource", resource: { uri: string, mimeType: string, text?: string, blob?: string } }
 * 
 * 5. Resource Link Content (资源链接) - 提供资源链接引用
 *    { type: "resource_link", uri: string, name?: string, description?: string, mimeType?: string }
 * 
 * 完整返回结构:
 * {
 *   content: Array<ContentObject>,  // content 对象数组
 *   isError?: boolean,              // 可选：是否为错误结果 (默认 false)
 *   structuredContent?: object      // 可选：结构化内容数据
 * }
 */
const tool_name = "edit_image_text"

export function registerQwenImageEditTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "Edit text in images using this model. Specializes in precise text editing capabilities for both Chinese and English text within images. Can add, remove, modify, or replace text while preserving original font styles, sizes, and layouts. Supports both semantic editing (overall style changes) and appearance editing (precise text modifications).",
        {
            image: z.string().url("Image must be a valid URL").describe("URL of the image to edit. Must be a valid JPEG, PNG, GIF, or WebP image accessible via HTTP/HTTPS"),
            prompt: z.string().min(1, "Prompt is required").describe("English instruction describing how to edit the text in the image. Be specific about what text to change, add, or remove. Examples: 'Change the Chinese text to 你好', 'Replace the English word Hello with Welcome', 'Add blue Chinese text 欢迎 at the top'"),
            aspect_ratio: z.enum([
                "1:1", "16:9", "9:16", "4:3", "3:4", "match_input_image"
            ]).optional().default("match_input_image").describe("Aspect ratio for the output image. Use 'match_input_image' to preserve the original image proportions, or select a specific ratio for cropping/resizing"),
            go_fast: z.boolean().optional().default(true).describe("Enable fast prediction mode with additional optimizations. Recommended for faster processing"),
            seed: z.number().int().optional().describe("Random seed for reproducible results. Use the same seed with identical parameters to get consistent outputs"),
            output_format: z.enum([
                "png", "webp"
            ]).optional().default("png").describe("Output image format. PNG provides lossless quality, WebP offers smaller file sizes"),
            output_quality: z.number().int().min(0).max(100).optional().default(95).describe("Output image quality from 0-100. Higher values mean better quality but larger file sizes. Not applicable for PNG format"),
            disable_safety_checker: z.boolean().optional().default(true).describe("Disable the built-in safety checker for generated images. Set to false for stricter content filtering")
        },
        async ({ image, prompt, aspect_ratio, go_fast, seed, output_format, output_quality, disable_safety_checker }) => {
            // Retrieve Bearer token using the provided function
            const apiKey = await getBearerToken();
            console.log("Tool execution - Bearer token retrieved:", apiKey ? "[present]" : "[missing]");
            
            if (!apiKey) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "error",
                                error_code: "MISSING_API_KEY",
                                message: "Replicate API key not available. Please provide a valid Bearer token in the Authorization header.",
                                filepath: null,
                                metadata: null
                            }, null, 2)
                        }
                    ],
                    isError: true
                };
            }

            try {
                const replicate = new Replicate({
                    auth: apiKey,
                });

                const input: any = {
                    image,
                    prompt,
                    aspect_ratio,
                    go_fast,
                    output_format,
                    output_quality,
                    disable_safety_checker,
                };

                // Only include seed if provided
                if (seed !== undefined) {
                    input.seed = seed;
                }

                const output = await replicate.run("qwen/qwen-image-edit", { input });
                
                // Qwen-Image-Edit returns an array of URLs, get the first one
                const imageUrl = Array.isArray(output) ? output[0] : output;
                
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${imageUrl}`,
                                message: "Image text editing completed successfully. Do not direct return this filepath url to user, we will upload to our own server",
                                metadata: {
                                    original_image: image,
                                    prompt: prompt,
                                    aspect_ratio: aspect_ratio,
                                    go_fast: go_fast,
                                    seed: seed || null,
                                    output_format: output_format,
                                    output_quality: output_quality,
                                    disable_safety_checker: disable_safety_checker
                                }
                            }, null, 2)
                        }
                    ],
                    
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "error",
                                error_code: "EDITING_FAILED",
                                message: `Error editing image: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    original_image: image,
                                    prompt: prompt,
                                    aspect_ratio: aspect_ratio,
                                    go_fast: go_fast,
                                    seed: seed || null,
                                    output_format: output_format,
                                    output_quality: output_quality,
                                    disable_safety_checker: disable_safety_checker
                                }
                            }, null, 2)
                        }
                    ],
                    isError: true
                };
            }
        }
    );
}