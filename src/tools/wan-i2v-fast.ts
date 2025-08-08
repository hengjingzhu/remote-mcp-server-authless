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
const tool_name = "generate_video_from_image"

export function registerWanI2VFastTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "Generates high-quality videos from single image only. This tool converts a single input image into a dynamic video with realistic motion and transitions. Perfect for creating animated content, cinematic sequences, and bringing static images to life with AI-powered video generation.",
        {
            image: z.string().url("Image must be a valid URL").describe("Input image URL to generate video from. Must be a publicly accessible image URL (HTTPS). The image will serve as the starting frame for the generated video"),
            prompt: z.string().min(1, "Prompt is required").describe("Detailed English text description for video generation. Describe the motion, action, or transformation you want to see in the video. Be specific about camera movements, character actions, environmental changes, etc."),
            num_frames: z.number().int().min(81).max(120).optional().default(81).describe("Number of video frames to generate. 81 frames give the best results. Higher values create longer videos but take more time and resources. Range: 1-200"),
            resolution: z.enum(["480p", "720p"]).optional().default("480p").describe("Video resolution quality. '480p' for faster generation and smaller files, '720p' for higher quality but longer processing time. Note: 480p corresponds to 832x480px for 16:9 or 480x832px for 9:16"),
            frames_per_second: z.number().int().min(1).max(30).optional().default(24).describe("Frames per second (FPS) for the output video. 24 FPS is cinematic standard. Higher values create smoother motion but larger file sizes. Range: 1-60"),
            go_fast: z.boolean().optional().default(true).describe("Enable speed optimization for faster generation. Recommended to keep enabled for better performance. When disabled, generation may be more thorough but significantly slower"),
            sample_shift: z.number().optional().describe("Sample shift factor for fine-tuning generation behavior. Advanced parameter that affects the sampling process. Leave unset for default behavior unless you need specific control over the generation process"),
            seed: z.number().int().optional().describe("Random seed for reproducible results. Use the same seed with identical parameters to generate the same video. Leave empty for random generation. Useful for consistent results in testing or when you want to recreate a specific output")
        },
        async ({ image, prompt, num_frames, resolution, frames_per_second, go_fast, sample_shift, seed }) => {
            // Retrieve Bearer token using the provided function
            const apiKey = await getBearerToken();
            console.log("Tool execution - Bearer token retrieved:", apiKey ? "[present]" : "[missing]");
            
            if (!apiKey) {
                return {
                    content: [
                        {
                            // 使用 Text Content 类型返回结构化的错误信息
                            // 可选的其他类型：image, audio, resource, resource_link
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
                    // 标记为错误结果，让 LLM 知道这是一个错误状态
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
                    num_frames,
                    resolution,
                    frames_per_second,
                    go_fast,
                };

                // Add optional parameters only if provided
                if (sample_shift !== undefined) {
                    input.sample_shift = sample_shift;
                }
                
                if (seed !== undefined) {
                    input.seed = seed;
                }

                const output = await replicate.run("wan-video/wan-2.2-i2v-fast", { input });
                
                return {
                    content: [
                        {
                            // 当前使用 Text Content 类型返回成功结果的结构化数据
                            // 
                            // 未来可考虑的其他返回类型：
                            // 
                            // 1. Resource Link 类型 - 直接提供视频链接：
                            // { 
                            //   type: "resource_link", 
                            //   uri: output, 
                            //   name: "Generated Video", 
                            //   mimeType: "video/mp4" 
                            // }
                            // 
                            // 2. Audio Content 类型 - 如果视频包含音频且需要单独返回：
                            // { 
                            //   type: "audio", 
                            //   data: "base64-encoded-audio-data", 
                            //   mimeType: "audio/mp4" 
                            // }
                            // 
                            // 3. Resource Content 类型 - 嵌入完整的视频文件内容：
                            // { 
                            //   type: "resource", 
                            //   resource: { 
                            //     uri: "generated://video", 
                            //     mimeType: "video/mp4", 
                            //     blob: "base64-encoded-video-data" 
                            //   } 
                            // }
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${output}`,  // WAN 2.2 i2v-fast API 返回视频文件 URL
                                message: "Video generated successfully from image. Do not direct return this url to user, we will upload to our own server",
                                metadata: {
                                    prompt: prompt,
                                    // image: image,
                                    num_frames: num_frames,
                                    resolution: resolution,
                                    frames_per_second: frames_per_second,
                                    go_fast: go_fast,
                                    sample_shift: sample_shift || null,
                                    seed: seed || null
                                }
                            }, null, 2)
                        }
                    ],
                    
                };
            } catch (error) {
                return {
                    content: [
                        {
                            // 使用 Text Content 类型返回异常错误信息
                            // 包含详细的错误信息和请求参数，便于调试
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "error",
                                error_code: "GENERATION_FAILED",
                                message: `Error generating video: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    prompt: prompt,
                                    image: image,
                                    num_frames: num_frames,
                                    resolution: resolution,
                                    frames_per_second: frames_per_second,
                                    go_fast: go_fast,
                                    sample_shift: sample_shift || null,
                                    seed: seed || null
                                }
                            }, null, 2)
                        }
                    ],
                    // 明确标记为错误结果
                    isError: true
                };
            }
        }
    );
}