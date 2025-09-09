import fetch from "node-fetch";

export async function askOpenAI(question) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo", // you can change to gpt-4 if needed
        messages: [{ role: "user", content: question }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.choices[0].message.content;
  } catch (err) {
    console.error("❌ OpenAI API Error:", err.message);
    throw err;
  }
}