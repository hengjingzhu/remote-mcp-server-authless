# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a remote MCP (Model Context Protocol) server deployed on Cloudflare Workers without authentication. The server provides tools that can be accessed remotely via SSE (Server-Sent Events) or direct MCP protocol.

## Development Commands

- `npm run dev` or `npm start` - Start local development server with Wrangler,[wrangler:info] Ready on http://127.0.0.1:8787
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run type-check` - Run TypeScript type checking without emitting files
- `npm run lint:fix` - Run Biome linter and automatically fix issues
- `npm run format` - Format code using Biome
- `npm run cf-typegen` - Generate Cloudflare Worker types
- `npx @modelcontextprotocol/inspector@latest` - run the mcp inspector,listening on localhost:6277
## Architecture

### Core Components

- **MyMCP class** (`src/index.ts`): Extends `McpAgent<Env>` and contains the MCP server configuration with tools defined in the `init()` method
- **Server endpoints**:
  - `/sse` - Server-Sent Events endpoint for remote MCP clients (used by Claude Desktop via mcp-remote proxy)
  - `/mcp` - Direct MCP protocol endpoint
- **Durable Objects**: MyMCP class is configured as a Durable Object in wrangler.jsonc
- **Environment variables**: Defined in `Env` interface, includes `E2B_API_KEY` for sandbox integration

### Adding New Tools

To add custom MCP tools, define them inside the `init()` method using `this.server.tool()`:

```typescript
this.server.tool(
  "tool_name",
  { param: z.string() }, // Zod schema for parameters validation
  async ({ param }) => ({
    content: [{ type: "text", text: "response" }],
  })
);
```

### Key Dependencies

- `@modelcontextprotocol/sdk` - Official MCP protocol implementation
- `agents/mcp` - Base MCP agent class (latest version)
- `zod` - Runtime schema validation for tool parameters
- `@e2b/code-interpreter` - E2B sandbox integration for code execution

## 重要注意事项 (Important Notes)

### Bearer Token Handling in MCP Architecture

Due to the MCP SDK's architectural design, Authorization headers from initial HTTP requests are not automatically passed through to tool execution contexts. This creates a challenge for tools that require API keys or authentication tokens.

**Problem**: The MCP SDK separates the initial HTTP request (containing Authorization headers) from the WebSocket connections used for tool execution. Tools like `generate_svg` that need API keys cannot access the Bearer token directly.

**Solution**: Implement a token storage pattern that works within MCP SDK constraints:

1. **Worker-level token extraction**: Extract Bearer token and session ID from incoming requests before delegating to MCP SDK
2. **Persistent storage**: Store the Bearer token in Durable Object storage using the correct session naming conventions
3. **Tool-level retrieval**: Retrieve the Bearer token from storage during tool execution

**Implementation Pattern**:

```typescript
// In worker fetch handler - store token before MCP SDK routing
const token = extractBearerToken(request);
const sessionId = getSessionId(request, url);
await storeBearerTokenInDO(env, sessionId, token, endpointType);

// In MyMCP class - handle storage requests
async fetch(request: Request): Promise<Response> {
  if (url.pathname === "/store-bearer-token" && request.method === "POST") {
    const { token } = await request.json();
    await this.ctx.storage.put("bearerToken", token);
    return new Response("Token stored", { status: 200 });
  }
  return super.fetch(request);
}

// In tool implementation - retrieve token from storage
async ({ param }) => {
  if (!this.currentBearerToken) {
    this.currentBearerToken = await this.ctx.storage.get("bearerToken");
  }
  const apiKey = this.currentBearerToken;
  // Use apiKey for external API calls
}
```

**Session ID Conventions**: 
- SSE connections: `sse:${sessionId}`
- Direct MCP connections: `streamable-http:${sessionId}`

This pattern ensures Bearer tokens are accessible during tool execution while respecting the MCP SDK's WebSocket upgrade process.

## Deployment Configuration

- **Wrangler config** (`wrangler.jsonc`): Defines Durable Objects binding for MyMCP class
- **Compatibility**: Uses 2025-03-10 compatibility date with nodejs_compat flag
- **Entry point**: `src/index.ts` handles routing between /sse and /mcp endpoints

## Connection Methods

1. **Cloudflare AI Playground**: Direct connection using deployed URL
2. **Claude Desktop**: Via mcp-remote proxy with configuration in Claude Desktop settings
3. **Local development**: Connect to `http://localhost:8787/sse`

## MCP 工具返回结果规范 (MCP Tool Return Result Specification)

### Content 对象类型选择 (Content Object Type Options)

MCP 工具可以返回 5 种不同类型的 content 对象，每种类型支持不同的字段：

#### 1. Text Content (文本内容)
最常用的返回类型，用于返回纯文本结果：

```typescript
{
  type: "text",
  text: string  // 工具执行结果的文本内容
}
```

**示例:**
```json
{
  "type": "text",
  "text": "SVG generated successfully. URL: https://example.com/image.svg"
}
```

#### 2. Image Content (图片内容)
用于返回图片数据：

```typescript
{
  type: "image",
  data: string,     // base64 编码的图片数据
  mimeType: string  // 图片的 MIME 类型 (如 "image/png", "image/jpeg")
}
```

**示例:**
```json
{
  "type": "image",
  "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "mimeType": "image/png"
}
```

#### 3. Audio Content (音频内容)
用于返回音频数据：

```typescript
{
  type: "audio",
  data: string,     // base64 编码的音频数据
  mimeType: string  // 音频的 MIME 类型 (如 "audio/wav", "audio/mp3")
}
```

**示例:**
```json
{
  "type": "audio",
  "data": "UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQcBSdadr6GDBS1kH8hMm5eNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaL", 
  "mimeType": "audio/wav"
}
```

#### 4. Resource Content (嵌入式资源内容)
用于直接嵌入资源内容：

```typescript
{
  type: "resource",
  resource: {
    uri: string,           // 资源的唯一标识符
    name?: string,         // 资源名称 (可选)
    title?: string,        // 资源标题 (可选)
    description?: string,  // 资源描述 (可选)
    mimeType: string,      // 资源的 MIME 类型
    text?: string,         // 文本资源内容 (二选一)
    blob?: string          // base64 编码的二进制资源内容 (二选一)
  }
}
```

**文本资源示例:**
```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///project/config.json",
    "name": "config.json",
    "title": "Project Configuration",
    "mimeType": "application/json",
    "text": "{\n  \"version\": \"1.0.0\",\n  \"name\": \"my-project\"\n}"
  }
}
```

**二进制资源示例:**
```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///project/logo.png",
    "name": "logo.png", 
    "title": "Company Logo",
    "mimeType": "image/png",
    "blob": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
  }
}
```

#### 5. Resource Link Content (资源链接内容)
用于提供资源链接引用：

```typescript
{
  type: "resource_link",
  uri: string,           // 资源的 URI
  name?: string,         // 资源名称 (可选)
  description?: string,  // 资源描述 (可选)
  mimeType?: string      // 资源的 MIME 类型 (可选)
}
```

**示例:**
```json
{
  "type": "resource_link",
  "uri": "https://api.example.com/results/12345",
  "name": "Generation Result",
  "description": "Generated SVG file available for download",
  "mimeType": "image/svg+xml"
}
```

### Replicate 图像生成工具标准格式 (Replicate Image Generation Tool Standard Format)

对于所有 Replicate 图像生成模型工具，统一使用以下标准化 JSON 数据格式返回结果：

```typescript
{
    type: "text",
    text: JSON.stringify({
        tool_name: string,        // 工具名称标识符
        status: "success",        // 执行状态 ("success" | "error")
        filepath: string,         // API 返回的文件路径或 URL
        message: string,          // 人类可读的状态消息
        metadata: {
            prompt: string,           // 用户输入的提示词
            size: string,            // 图像尺寸
            aspect_ratio: string,    // 宽高比
            style: string | null     // 样式设置 (可选)
        }
    }, null, 2)
}
```

**标准格式示例:**
```json
{
  "type": "text",
  "text": "{\n  \"tool_name\": \"recraft_svg\",\n  \"status\": \"success\",\n  \"filepath\": \"https://replicate.delivery/pbxt/abc123.svg\",\n  \"message\": \"SVG Image generated successfully\",\n  \"metadata\": {\n    \"prompt\": \"A modern logo design\",\n    \"size\": \"1024x1024\",\n    \"aspect_ratio\": \"1:1\",\n    \"style\": \"vector_illustration\"\n  }\n}"
}
```

**字段说明:**
- `tool_name`: 标识使用的具体工具，便于前端识别和处理
- `status`: 明确标识执行结果状态
- `filepath`: 统一使用 `filepath` 而非 `url`，保持与 Replicate API 返回值的一致性
- `message`: 提供用户友好的状态描述
- `metadata`: 包含生成参数的详细信息，便于调试和日志记录

**使用场景:**
- Recraft SVG 生成工具
- 其他基于 Replicate 的图像生成模型
- 需要标准化响应格式的图像处理工具

### 完整工具返回结构 (Complete Tool Return Structure)

```typescript
{
  content: Array<ContentObject>,  // content 对象数组
  isError?: boolean,              // 可选：是否为错误结果 (默认 false)
  structuredContent?: object      // 可选：结构化内容数据
}
```

**成功返回示例:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "SVG generated successfully"
    }
  ],
  "isError": false
}
```

**错误返回示例:**
```json
{
  "content": [
    {
      "type": "text", 
      "text": "Failed to generate SVG: API rate limit exceeded"
    }
  ],
  "isError": true
}
```

**带结构化数据的返回示例:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Weather data retrieved successfully"
    }
  ],
  "structuredContent": {
    "temperature": 22.5,
    "conditions": "Partly cloudy",
    "humidity": 65
  }
}
```

### 使用建议 (Usage Guidelines)

1. **Text Content**: 用于大多数基本文本响应，如状态消息、简单结果
2. **Image Content**: 当工具生成或处理图片时使用，避免外部链接依赖
3. **Audio Content**: 用于音频处理工具的输出
4. **Resource Content**: 当需要提供完整的文件内容时使用，支持文本和二进制数据
5. **Resource Link**: 当资源太大或需要外部访问时使用链接引用

**最佳实践:**
- 优先使用 `text` 类型用于简单响应
- 对于大型文件，考虑使用 `resource_link` 而不是 `resource`
- 设置适当的 `mimeType` 帮助客户端正确处理内容
- 使用 `isError` 字段明确标识错误情况
- 在返回结构化数据时考虑使用 `structuredContent` 字段

## Code Standards

- Biome for linting and formatting (4-space indentation, 100-character line width)
- TypeScript strict mode enabled
- Uses ES2022 modules with bundler resolution