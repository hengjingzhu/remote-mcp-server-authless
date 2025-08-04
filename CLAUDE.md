# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a remote MCP (Model Context Protocol) server deployed on Cloudflare Workers without authentication. The server provides tools that can be accessed remotely via SSE (Server-Sent Events) or direct MCP protocol.

## Development Commands

- `npm run dev` or `npm start` - Start local development server with Wrangler
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run type-check` - Run TypeScript type checking without emitting files
- `npm run lint:fix` - Run Biome linter and automatically fix issues
- `npm run format` - Format code using Biome
- `npm run cf-typegen` - Generate Cloudflare Worker types

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

## Deployment Configuration

- **Wrangler config** (`wrangler.jsonc`): Defines Durable Objects binding for MyMCP class
- **Compatibility**: Uses 2025-03-10 compatibility date with nodejs_compat flag
- **Entry point**: `src/index.ts` handles routing between /sse and /mcp endpoints

## Connection Methods

1. **Cloudflare AI Playground**: Direct connection using deployed URL
2. **Claude Desktop**: Via mcp-remote proxy with configuration in Claude Desktop settings
3. **Local development**: Connect to `http://localhost:8787/sse`

## Code Standards

- Biome for linting and formatting (4-space indentation, 100-character line width)
- TypeScript strict mode enabled
- Uses ES2022 modules with bundler resolution