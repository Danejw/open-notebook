# Model Context Protocol (MCP) Integration

Construction OS can be seamlessly integrated into your AI workflows using the **Model Context Protocol (MCP)**, enabling direct access to your projects, sources, and chat functionality from AI assistants like Claude Desktop and VS Code extensions.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard that allows AI applications to securely connect to external data sources and tools. With the Construction OS MCP server, you can:

- 📚 **Access your projects** directly from Claude Desktop or VS Code
- 🔍 **Search your research content** without leaving your AI assistant
- 💬 **Create and manage chat sessions** with your research as context
- 📝 **Generate notes** and insights on-the-fly
- 🤖 **Automate workflows** using the full Construction OS API

## Quick Setup

### For Claude Desktop

1. **Install the MCP server** (automatically from PyPI):

   ```bash
   # No manual installation needed! Claude Desktop will use uvx to run it automatically
   ```

2. **Configure Claude Desktop**:

   **macOS/Linux**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "construction-os": {
         "command": "uvx",
         "args": ["construction-os-mcp"],
         "env": {
           "CONSTRUCTION_OS_URL": "http://localhost:5055",
           "CONSTRUCTION_OS_PASSWORD": "your_password_here"
         }
       }
     }
   }
   ```

   **Windows**: Edit `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "construction-os": {
         "command": "uvx",
         "args": ["construction-os-mcp"],
         "env": {
           "CONSTRUCTION_OS_URL": "http://localhost:5055",
           "CONSTRUCTION_OS_PASSWORD": "your_password_here"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop** and start using your projects in conversations!

### For VS Code (Cline and other MCP-compatible extensions)

Add to your VS Code settings or `.vscode/mcp.json`:

```json
{
  "servers": {
    "construction-os": {
      "command": "uvx",
      "args": ["construction-os-mcp"],
      "env": {
        "CONSTRUCTION_OS_URL": "http://localhost:5055",
        "CONSTRUCTION_OS_PASSWORD": "your_password_here"
      }
    }
  }
}
```

## Configuration

- **CONSTRUCTION_OS_URL**: URL to your Construction OS API (default: `http://localhost:5055`)
- **CONSTRUCTION_OS_PASSWORD**: Optional - only needed if you've enabled password protection

### For Remote Servers

If your Construction OS instance is running on a remote server, update the URL accordingly:

```json
"CONSTRUCTION_OS_URL": "http://192.168.1.100:5055"
```

Or with a domain:

```json
"CONSTRUCTION_OS_URL": "https://project.yourdomain.com/api"
```

## What You Can Do

Once connected, you can ask Claude or your AI assistant to:

- _"Search my research projects for information about [topic]"_
- _"Create a new note summarizing the key points from our conversation"_
- _"List all my projects"_
- _"Start a chat session about [specific source or topic]"_
- _"What sources do I have in my [project name] project?"_
- _"Add this PDF to my research project"_
- _"Show me all notes in [project name]"_

The MCP server provides full access to Construction OS's capabilities, allowing you to manage your research seamlessly from within your AI assistant.

## Available Tools

The Construction OS MCP server exposes these capabilities:

### Projects

- List projects
- Get project details
- Create new projects
- Update project information
- Delete projects

### Sources

- List sources in a project
- Get source details
- Add new sources (links, files, text)
- Update source metadata
- Delete sources

### Notes

- List notes in a project
- Get note details
- Create new notes
- Update notes
- Delete notes

### Chat

- Create chat sessions
- Send messages to chat sessions
- Get chat history
- List chat sessions

### Search

- Vector search across content
- Text search across content
- Filter by project

### Models

- List configured AI models
- Get model details
- Create model configurations
- Update model settings

### Settings

- Get application settings
- Update settings

## MCP Server Repository

The Construction OS MCP server is developed and maintained by the Epochal team:

**🔗 GitHub**: [Epochal-dev/construction-os-mcp](https://github.com/Epochal-dev/construction-os-mcp)

Contributions, issues, and feature requests are welcome!

## Finding the Server

The Construction OS MCP server is published to the official MCP Registry:

- **Registry**: Search for "construction-os" at [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)
- **PyPI**: [pypi.org/project/construction-os-mcp](https://pypi.org/project/construction-os-mcp)
- **GitHub**: [Epochal-dev/construction-os-mcp](https://github.com/Epochal-dev/construction-os-mcp)

## Troubleshooting

### Connection Errors

1. Verify the `CONSTRUCTION_OS_URL` is correct and accessible
2. If using password protection, ensure `CONSTRUCTION_OS_PASSWORD` is set correctly
3. For remote servers, make sure port 5055 is accessible from your machine
4. Check firewall settings if connecting to a remote server

## Using with Other MCP Clients

The Construction OS MCP server follows the standard MCP protocol and can be used with any MCP-compatible client. Check your client's documentation for configuration details.

## Learn More

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
