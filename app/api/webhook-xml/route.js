import { NextResponse } from "next/server";
import axios from "axios";
import { mongooseConnect } from "@/app/lib/mongooseConnect";
import Product from "@/app/model/product";

// registered address address: 'https://mofficer.vercel.app/api/webhook-handler',

// test format structure
// Webhook received: {
  //   id: 271878346596884000,
  //   sku: 'example-sku',
  //   created_at: '2025-02-19T16:21:59-03:00',
  //   updated_at: '2025-02-19T16:21:59-03:00',
  //   requires_shipping: true,
  //   cost: null,
  //   country_code_of_origin: null,
  //   province_code_of_origin: null,
  //   harmonized_system_code: null,
  //   tracked: true,
  //   country_harmonized_system_codes: [],
  //   weight_value: 0,
  //   weight_unit: 'kg',
  //   admin_graphql_api_id: 'gid://shopify/InventoryItem/271878346596884015'
// }

// todo: test when possible with products. 

export async function POST(req) {
  await mongooseConnect();
  console.log('entered webhook')
  try {
    // // Read the incoming webhook payload
    const payload = await req.json();
    console.log("Webhook received:", payload);

    // Ensure that the payload contains necessary fields before processing
    if (!payload.id || !payload.title || !payload.variants || payload.variants.length === 0) {
      return new Response('Invalid payload', { status: 400 });
    }

    // For this example, we assume the payload is a product object.
    // You might need to adjust based on the webhook topic (create, update, delete).
    const productData = {
      id: payload.id,
      title: payload.title,
      description: payload.body_html, // Assuming Shopify sends HTML in `body_html`
      link: `https://www.mofficer.com.br/products/${payload.handle}`,
      image: payload.image,
      price: payload.variants && payload.variants[0]?.price,
      condition: 'new', // Default value – adjust as needed
      availability: (payload.variants && payload.variants[0]?.inventory_quantity > 0) ? 'in stock' : 'out of stock',
      imageLink: payload.image?.src || '',
      sku: payload.variants && payload.variants[0]?.sku,
      productType: payload.product_type || '',
      variants: payload.variants.map(variant => ({
        id: +variant.id,
        sku: +variant.sku || "",
        price: +variant.price || 0.00,
        inventory_quantity: +variant.inventory_quantity || 0, // Ensure numeric inventory count
      }))
    };

    // Upsert product data (update if exists, otherwise create new)
    await Product.findOneAndUpdate({ id: productData.id }, productData, { upsert: true, new: true });

    // Trigger your feed generation process from my generateFeed route! // no need for this since this is not stored anywhere - google pulls from db
    const response = await axios.get("https://mofficer.vercel.app/api/google-feed");

    return NextResponse.json({ message: "webhook"}, { status: 200 });
    // return NextResponse.json({ message: "Feed generated", data: response.data }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ message: "Webhook processing failed" }, { status: 500 });
  }
}
