import { NextResponse } from "next/server";
import axios from "axios";

// registered address address: 'https://mofficer.vercel.app/api/webhook-handler',

// when this route is reached it will call the generateFeed which responds with xml list
// 

export async function POST(req) {

  try {
    // // Read the incoming webhook payload
    const body = await req.json();
    console.log("Webhook received:", body);

    // Trigger your feed generation process from my generateFeed route!
    const response = await axios.get("https://mofficer.vercel.app/api/generateFeed");

    return NextResponse.json({ message: "Feed generated", data: response.data }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ message: "Webhook processing failed" }, { status: 500 });
  }
}
