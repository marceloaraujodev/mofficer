import axios from 'axios';

import dotenv from 'dotenv';
dotenv.config();

// will register a webhook with shopify, all we need is the access token

const shop = "mofficerbrasil";
const accessToken = process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN;

const registerWebhook = async () => {
  try {
    const response = await axios.post(
      `https://${shop}.myshopify.com/admin/api/2024-10/webhooks.json`,
      {
        webhook: {
          topic: "products/update",
          address: "https://mofficer.vercel.app/api/webhook-handler",
          format: "json",
        },
      },
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Webhook registered:", response.data);
  } catch (error) {
    console.error("Error registering webhook:", error.response?.data || error.message);
  }
};

// registerWebhook();

export function test(){
  console.log(process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN)
  registerWebhook();
}
