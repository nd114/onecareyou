import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_URL = "https://api.notion.com/v1/pages";
const NOTION_DATABASE_ID = "2e8ef36ce123429e9a9efba856e2fd04";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) {
      throw new Error("NOTION_API_KEY is not configured");
    }

    const { bugReport } = await req.json();

    if (!bugReport || !bugReport.description) {
      return new Response(
        JSON.stringify({ error: "Missing bug report data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const categoryMap: Record<string, string> = {
      bug: "🐛 Bug",
      design: "🎨 Design / UX",
      suggestion: "💡 Suggestion",
    };

    const browserInfo = bugReport.browser_info || {};
    const browserString = browserInfo.userAgent
      ? browserInfo.userAgent.split(" ").slice(-2).join(" ")
      : "Unknown";

    const notionPayload = {
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: bugReport.description.substring(0, 100),
              },
            },
          ],
        },
        Category: {
          select: {
            name: categoryMap[bugReport.category] || "🐛 Bug",
          },
        },
        Status: {
          select: { name: "New" },
        },
        "Page URL": {
          url: bugReport.page_url || null,
        },
        Browser: {
          rich_text: [
            {
              text: { content: browserString.substring(0, 200) },
            },
          ],
        },
        Viewport: {
          rich_text: [
            {
              text: { content: browserInfo.viewport || "Unknown" },
            },
          ],
        },
        Submitted: {
          date: {
            start: new Date().toISOString(),
          },
        },
        Reporter: {
          rich_text: [
            {
              text: { content: bugReport.user_id || "Anonymous" },
            },
          ],
        },
        "Report ID": {
          rich_text: [
            {
              text: { content: bugReport.id || "" },
            },
          ],
        },
      },
      children: [
        {
          object: "block" as const,
          type: "heading_2" as const,
          heading_2: {
            rich_text: [{ type: "text" as const, text: { content: "Full Description" } }],
          },
        },
        {
          object: "block" as const,
          type: "paragraph" as const,
          paragraph: {
            rich_text: [
              { type: "text" as const, text: { content: bugReport.description } },
            ],
          },
        },
        {
          object: "block" as const,
          type: "heading_2" as const,
          heading_2: {
            rich_text: [{ type: "text" as const, text: { content: "Technical Details" } }],
          },
        },
        {
          object: "block" as const,
          type: "bulleted_list_item" as const,
          bulleted_list_item: {
            rich_text: [
              {
                type: "text" as const,
                text: { content: `Page: ${bugReport.page_url || "N/A"}` },
              },
            ],
          },
        },
        {
          object: "block" as const,
          type: "bulleted_list_item" as const,
          bulleted_list_item: {
            rich_text: [
              {
                type: "text" as const,
                text: {
                  content: `User Agent: ${browserInfo.userAgent || "N/A"}`,
                },
              },
            ],
          },
        },
        {
          object: "block" as const,
          type: "bulleted_list_item" as const,
          bulleted_list_item: {
            rich_text: [
              {
                type: "text" as const,
                text: {
                  content: `Viewport: ${browserInfo.viewport || "N/A"}`,
                },
              },
            ],
          },
        },
      ],
    };

    const notionResponse = await fetch(NOTION_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(notionPayload),
    });

    const notionData = await notionResponse.json();

    if (!notionResponse.ok) {
      console.error("Notion API error:", JSON.stringify(notionData));
      throw new Error(
        `Notion API error [${notionResponse.status}]: ${notionData.message || "Unknown error"}`
      );
    }

    return new Response(
      JSON.stringify({ success: true, notionPageId: notionData.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error syncing bug report to Notion:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
