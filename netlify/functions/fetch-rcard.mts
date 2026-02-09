
import { Context } from "@netlify/functions";

// R-Card API Base URL
const API_BASE = "https://api-v2.rcard.re.kr";

export default async (req: Request, context: Context) => {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
        return new Response("Missing slug parameter", { status: 400 });
    }

    try {
        // 1. Get Profile & ID
        const profileRes = await fetch(`${API_BASE}/account/detail/${slug}`);
        if (!profileRes.ok) {
            return new Response(`Failed to fetch profile: ${profileRes.status}`, { status: profileRes.status });
        }
        const profileData = await profileRes.json();
        const id = profileData.id; // Numeric ID
        const name = profileData.name || profileData.nameEn || "";
        const affiliation = profileData.institutionName || "";
        const keywords = (profileData.keywords || []).map((k: any) => k.name).join(", ");

        // 2. Parallel Fetch: Projects, Theses, Patents
        const [projectsRes, thesesRes, patentsRes] = await Promise.all([
            fetch(`${API_BASE}/project/detail/${id}?page=1&size=50`),
            fetch(`${API_BASE}/thesis/detail/${id}?page=1&size=50`),
            fetch(`${API_BASE}/patent/detail/${id}?page=1&size=50`)
        ]);

        let aggregatedText = `Researcher: ${name}\nAffiliation: ${affiliation}\nKeywords: ${keywords}\n\n`;

        // 3. Process Projects
        if (projectsRes.ok) {
            const projectsData = await projectsRes.json();
            const projects = projectsData.content || [];
            if (projects.length > 0) {
                aggregatedText += "Projects:\n";
                projects.forEach((p: any) => {
                    aggregatedText += `- ${p.name || ""} (Keywords: ${p.keywords || ""})\n`;
                });
                aggregatedText += "\n";
            }
        }

        // 4. Process Theses/Papers
        if (thesesRes.ok) {
            const thesesData = await thesesRes.json();
            const theses = thesesData.content || [];
            if (theses.length > 0) {
                aggregatedText += "Papers:\n";
                theses.forEach((t: any) => {
                    aggregatedText += `- ${t.title || ""}\n`;
                });
                aggregatedText += "\n";
            }
        }

        // 5. Process Patents
        if (patentsRes.ok) {
            const patentsData = await patentsRes.json();
            const patents = patentsData.content || [];
            if (patents.length > 0) {
                aggregatedText += "Patents:\n";
                patents.forEach((p: any) => {
                    aggregatedText += `- ${p.title || ""}\n`;
                });
            }
        }

        return new Response(JSON.stringify({
            text: aggregatedText,
            metadata: {
                name,
                affiliation,
                id,
                url: `https://rcard.re.kr/detail/${slug}`
            }
        }), {
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // CORS
            }
        });

    } catch (error: any) {
        return new Response(`Error fetching data: ${error.message}`, { status: 500 });
    }
};
