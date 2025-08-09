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
const tool_name = "generate_video_seedance_pro"

export function registerSeedanceProTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "Generates high-quality videos using ByteDance SeedanceV1-Pro model. Supports both text-to-video (T2V) and image-to-video (I2V) generation. This professional video generation model creates 5s or 10s videos at 480p resolution with advanced motion dynamics and multi-shot support. Perfect for creative content, prototyping, and commercial video production.",
        {
            prompt: z.string().min(1, "Prompt is required").describe("English text prompt for video generation. Describe the motion, action, camera movements, and visual elements you want to see. Supports complex scene descriptions, multi-shot sequences, and various visual styles including photorealism, cyberpunk, and illustration."),
            image: z.string().url().optional().describe("Input image URL for image-to-video generation (I2V mode). Must be a publicly accessible HTTPS URL. When provided, the tool will generate video based on this image with the text prompt. Leave empty for text-to-video (T2V) mode."),
            duration: z.number().int().min(5).max(10).optional().default(5).describe("Video duration in seconds. Supported values: 5 or 10 seconds. Default is 5 seconds for faster generation and smaller file sizes. 10 seconds creates longer videos but takes more processing time."),
            resolution: z.enum(["480p", "720p", "1080p"]).optional().default("480p").describe("Video resolution quality. '480p' (recommended) for faster generation and smaller files, '720p' for balanced quality and speed which not recommand unless user required"),
            aspect_ratio: z.enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21"]).optional().default("16:9").describe("Video aspect ratio. Ignored if an image is provided for I2V mode. Common ratios: '16:9' for widescreen, '1:1' for square, '9:16' for vertical/mobile. Default is '16:9' for cinematic widescreen format."),
            fps: z.number().int().min(1).max(60).optional().default(24).describe("Frame rate (frames per second) for the output video. 24 FPS is cinematic standard, 30 FPS for smooth motion, 60 FPS for ultra-smooth but larger files. Default is 24 FPS. Range: 1-60."),
            camera_fixed: z.boolean().optional().default(false).describe("Whether to fix camera position during video generation. When true, the camera remains static focusing on subject movement. When false (default), allows dynamic camera movements including pans, zooms, and follows."),
            seed: z.number().int().optional().describe("Random seed for reproducible video generation. Use the same seed with identical parameters to generate the same video. Leave empty for random generation. Useful for consistent results in testing or when you want to recreate a specific output.")
        },
        async ({ prompt, image, duration, resolution, aspect_ratio, fps, camera_fixed, seed }) => {
            // Retrieve Bearer token using the provided function
            const apiKey = await getBearerToken();
            console.log("SeedancePro Tool - Bearer token retrieved:", apiKey ? "[present]" : "[missing]");
            
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

                // Build input parameters - only include defined values
                const input: any = {
                    prompt,
                    duration,
                    resolution,
                    fps,
                    camera_fixed,
                };

                // Add image parameter for I2V mode if provided
                if (image) {
                    input.image = image;
                }

                // Add aspect_ratio only if no image is provided (T2V mode)
                if (!image && aspect_ratio) {
                    input.aspect_ratio = aspect_ratio;
                }

                // Add optional seed parameter if provided
                if (seed !== undefined) {
                    input.seed = seed;
                }

                console.log("SeedancePro Tool - Input parameters:", {
                    mode: image ? "I2V (Image-to-Video)" : "T2V (Text-to-Video)",
                    prompt: prompt.substring(0, 100) + "...",
                    has_image: !!image,
                    duration,
                    resolution,
                    aspect_ratio: image ? "ignored (I2V mode)" : aspect_ratio,
                    fps,
                    camera_fixed,
                    seed: seed || "random"
                });

                const output = await replicate.run("bytedance/seedance-1-pro", { input });
                
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${output}`,
                                message: `Video generated successfully using SeedanceV1-Pro in ${image ? "I2V (Image-to-Video)" : "T2V (Text-to-Video)"} mode. High-quality ${duration}s video at ${resolution} resolution.`,
                                metadata: {
                                    mode: image ? "I2V" : "T2V",
                                    prompt: prompt,
                                    has_image: !!image,
                                    duration: duration,
                                    resolution: resolution,
                                    aspect_ratio: image ? null : aspect_ratio,
                                    fps: fps,
                                    camera_fixed: camera_fixed,
                                    seed: seed || null
                                }
                            }, null, 2)
                        }
                    ],
                };
            } catch (error) {
                console.error("SeedancePro Tool - Generation failed:", error);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "error",
                                error_code: "GENERATION_FAILED",
                                message: `Error generating video with SeedanceV1-Pro: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    mode: image ? "I2V" : "T2V",
                                    prompt: prompt,
                                    has_image: !!image,
                                    duration: duration,
                                    resolution: resolution,
                                    aspect_ratio: image ? null : aspect_ratio,
                                    fps: fps,
                                    camera_fixed: camera_fixed,
                                    seed: seed || null
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