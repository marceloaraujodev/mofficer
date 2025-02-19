import { NextResponse } from "next/server";
import axios from "axios";
import { mongooseConnect } from "@/app/lib/mongooseConnect";
import Product from "@/app/model/product";

// registered address address: 'https://mofficer.vercel.app/api/webhook-handler',




export async function POST(req) {
  await mongooseConnect();
  console.log('entered webhook')
  try {
    // // Read the incoming webhook payload
    const payload = await req.json();
    console.log("Webhook received:", payload);

    // // For this example, we assume the payload is a product object.
    // // You might need to adjust based on the webhook topic (create, update, delete).
    // const productData = {
    //   id: payload.id,
    //   title: payload.title,
    //   description: payload.body_html, // Assuming Shopify sends HTML in `body_html`
    //   link: `https://www.mofficer.com.br/products/${payload.handle}`,
    //   price: payload.variants && payload.variants[0]?.price,
    //   condition: 'new', // Default value – adjust as needed
    //   availability: (payload.variants && payload.variants[0]?.inventory_quantity > 0) ? 'in stock' : 'out of stock',
    //   imageLink: payload.image?.src || '',
    //   googleProductCategory: '', // Set if available
    //   sku: payload.variants && payload.variants[0]?.sku,
    //   productType: payload.product_type || '',
    // };

    // // Upsert product data (update if exists, otherwise create new)
    // await Product.findOneAndUpdate({ id: productData.id }, productData, { upsert: true, new: true });

    // // Trigger your feed generation process from my generateFeed route!
    // const response = await axios.get("https://mofficer.vercel.app/api/google-feed");

    return NextResponse.json({ message: "webhook", data: response.data }, { status: 200 });
    // return NextResponse.json({ message: "Feed generated", data: response.data }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ message: "Webhook processing failed" }, { status: 500 });
  }
}
