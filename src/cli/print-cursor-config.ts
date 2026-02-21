/**
 * Prints the Cursor mcp.json configuration snippet for a given profile.
 * No API keys appear in the output.
 */
export function printCursorConfig(profileName: string): void {
  const config = {
    mcpServers: {
      [profileName]: {
        command: "agentvault",
        args: ["proxy", "--profile", profileName],
      },
    },
  };
  console.log(JSON.stringify(config, null, 2));
}
