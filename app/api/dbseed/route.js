// app/api/initial-upload/route.js
import { NextResponse } from "next/server";
import axios from "axios";
import { mongooseConnect } from "@/app/lib/mongooseConnect";
import Product from "@/app/model/product";

// This should be ran to load db on first connection.

const fetchProducts = async (limit = 250) => {
  let allProducts = [];
  let url = `https://mofficerbrasil.myshopify.com/admin/api/2024-10/products.json?limit=${limit}`;
  let hasNextPage = true;
  
  try {
    while (hasNextPage) {
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN,
        },
      });
      allProducts = allProducts.concat(response.data.products);
      
      // Check for pagination in the 'link' header
      const linkHeader = response.headers["link"];
      if (linkHeader) {
        const nextPageUrl = linkHeader.match(/<([^>]+)>; rel="next"/);
        if (nextPageUrl) {
          url = nextPageUrl[1];
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }
    
    // Apply your filtering: valid products and in-stock products.
    const validProducts = allProducts.filter(product =>
      product.image?.src && product.status === 'active'
    );
    const inStockProducts = validProducts.filter(product =>
      product.variants.some(variant => variant.inventory_quantity > 0)
    );
    
    // Save each product to the database (upsert each document)
    for (const product of inStockProducts) {
      try {
        const newProduct = {
          id: +product.id,
          title: product.title,
          description: product.body_html,
          link: product.handle ? `https://mofficerbrasil.myshopify.com/products/${product.handle}` : "",
          price: +product.variants[0]?.price || 0.00,
          condition: "new", // Shopify does not provide this; assuming "new"
          availability: product.variants.some(variant => variant.inventory_quantity > 0) ? "in stock" : "out of stock",
          imageLink: product.image?.src,
          sku: +product.variants[0]?.sku || "",
          productType: product.product_type || "",
          variants: product.variants.map(variant => ({
            id: +variant.id,
            sku: +variant.sku || "",
            price: +variant.price || 0.00,
            inventory_quantity: +variant.inventory_quantity || 0, // Ensure numeric inventory count
          }))
        };
        await Product.findOneAndUpdate(
          { id: product.id },
          newProduct,
          { upsert: true, new: true }
        );
        
      } catch (error) {
        console.log(error)
        return NextResponse.json({ error})
      }
    }
    
    return NextResponse.json({ message: "Initial upload complete", count: inStockProducts.length });
    
  } catch (error) {
    console.error("Error during initial upload:", error.message);
    return NextResponse.json({ message: "Error during initial upload" }, { status: 500 });
  }
};

export async function GET() {
  await mongooseConnect();
  // return NextResponse.json({products})
  return fetchProducts();
}
