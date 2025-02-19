import axios from 'axios';
import xml2js from 'xml2js';
import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/app/lib/mongooseConnect';
import Product from '@/app/model/product';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// run the route on postman the xml list should be returned in the response

// Shopify API credentials
const adminApiAccessToken = process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN;
const shopName = 'mofficerbrasil';


const fetchProducts = async (limit = 10) => {
  let allProducts = [];
  let url = `https://mofficerbrasil.myshopify.com/admin/api/2024-10/products.json?limit=${limit}`;
  let hasNextPage = true;

  try {
    while (hasNextPage) {
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": adminApiAccessToken, // Use the access token for authentication
        },
      });

      // Concatenate the fetched products
      allProducts = allProducts.concat(response.data.products);

      // Stop fetching if we've reached the desired limit
      if (allProducts.length >= limit) {
        allProducts = allProducts.slice(0, limit); // Trim the array to the specified limit
        break;
      }

      // Check if there is another page using the 'link' header
      const linkHeader = response.headers["link"];
      if (linkHeader) {
        const nextPageUrl = linkHeader.match(/<([^>]+)>; rel="next"/);
        if (nextPageUrl) {
          url = nextPageUrl[1]; // Update the URL to the next page
        } else {
          hasNextPage = false; // No more pages
        }
      } else {
        hasNextPage = false; // No 'link' header means no more pages
      }
    }

    // Ensure `allProducts` is an array
    if (!Array.isArray(allProducts)) {
      console.error("Invalid products response", allProducts);
      return [];
    }

    // --------- Leave it here in case I need to grab all the products including out of stock and drafts from shopify
      // Filter out products without a valid image URL
      const validProducts = allProducts.filter(product => 
        product.image?.src && product.status === 'active'
      );


      // this will leave some variants that are out of stock in the xml
      // Filter products to include only those with at least one in-stock variant
      const inStockProducts = validProducts.filter(product =>
        product.variants.some(variant => variant.inventory_quantity > 0)
      );

    // ------------ only instock products on the xml list

    // // Filter out products without a valid image URL
    // const validProducts = allProducts.filter(product => product.image?.src);

    // // Filter products to include only those with at least one in-stock variant - only items and variants with stock
    // const inStockProducts = validProducts.map(product => {
    //   // Filter the variants to include only in-stock ones
    //   const inStockVariants = product.variants.filter(variant => variant.inventory_quantity > 0);

    //   // If no in-stock variants remain, exclude the product
    //   if (inStockVariants.length === 0) return null;

    //   // Return the product with only in-stock variants
    //   return {
    //     ...product,
    //     variants: inStockVariants,
    //   };
    // }).filter(product => product !== null); // Filter out invalid products

    // // this will give you the total number of available products that are active
      // const totalVariants = inStockProducts.reduce((count, product) => count + (product.variants?.length || 0), 0);
      // console.log(`Total Variants: ${totalVariants}`);
    //

    return inStockProducts;
  } catch (error) {
    console.error("Error fetching products:", error.message);
    return [];
  }
};

// Function to generate the XML feed from product data
const generateXmlFeed = (products) => {
  const escapeXml = (str) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  function toSentenceCase(str) {
    if (!str) return ""; // Handle empty or null strings
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const feed = {
    rss: {
      $: {
        version: "2.0",
        "xmlns:g": "http://base.google.com/ns/1.0",
        "xmlns:atom": "http://www.w3.org/2005/Atom",
      },
      channel: [
        {
          title: ["M.Officer Product Feed"],
          description: ["M.Officer Product Feed"],
          link: [`https://www.mofficer.com.br`],
          item: products.flatMap((product) =>
            product.variants.map((variant) => ({
              "g:id": `${product.id}-${variant.id}`, // Unique ID for the variant
              "g:title": escapeXml(toSentenceCase(product.title || "No Title Available")),
              title: escapeXml(toSentenceCase(product.title || "No Title Available")), // Standard RSS <title>
              description: escapeXml(product.body_html || "No Description Available"), // Standard RSS <description>
              link: `https://www.mofficer.com.br/products/${product.handle}`, // Standard RSS <link>
              "g:price": `${parseFloat(variant.price).toFixed(2)} BRL`,
              "g:condition": "new",
              "g:availability": variant.inventory_quantity > 0 ? "in stock" : "out of stock", // 
              // "g:link": `https://${shopName}.com/products/${product.handle}`,
              "g:image_link": product.image?.src || "",
              "g:google_product_category": variant.category,
              "g:sku": variant.sku,
              "g:brand": "M.Officer",
              "g:product_type": product.product_type || "Uncategorized",
              "g:identifier_exists": "FALSE",
            }))
          ),
        },
      ],
    },
  };
  const builder = new xml2js.Builder();
  return builder.buildObject(feed);

};

const cleanProductData = (products) => {
  return products
    .map((product) => {
      // Exclude products without required fields
      if (
        !product.title ||
        !product.body_html ||
        !product.image?.src ||
         product.status !== 'active'
      ) {
        return null;
      }

      // Clean the HTML content
      if (product.body_html) {
        product.body_html = cleanHtml(product.body_html);
      }

      // Process variants synchronously
      product.variants = product.variants
        .map((variant) => {
          // Exclude variants without a price, SKU, or valid inventory
          if (!variant.price || !variant.sku || variant.inventory_quantity < 0) {
            return null;
          }

          // Format price properly
          variant.price = parseFloat(variant.price).toFixed(2);

          // Set availability based on inventory
          variant.availability = variant.inventory_quantity > 0 ? 'in stock' : 'out of stock';

          return variant;
        })
        .filter((variant) => variant !== null); // Filter out invalid variants

      // If no valid variants remain, exclude the product
      if (product.variants.length === 0) return null;

      // Add fallback values for missing fields
      product.brand = product.brand || 'M.Officer';
      product.condition = product.condition || 'new';

      return product;
    })
    .filter((product) => product !== null); // Filter out invalid products
};
// Function to clean HTML tags from descriptions
function cleanHtml(rawHtml) {
  // Remove HTML tags
  let cleaned = rawHtml.replace(/<\/?[^>]+(>|$)/g, "");

  // Remove all instances of carriage return characters (&#xD;) and any extra whitespace
  cleaned = cleaned.replace(/&#xD;/g, "").trim();

  // Remove excessive newlines or unnecessary spaces
  cleaned = cleaned.replace(/\n+/g, "\n").replace(/\s{2,}/g, " ");

  return cleaned;
}

// Function to fix the XML data
async function fixXmlData(xmlData) {

  try {
    const result = await xml2js.parseStringPromise(xmlData, { trim: true, explicitArray: false });

    let items = result?.rss?.channel?.item;
    if (!Array.isArray(items)) {
      items = items ? [items] : [];
    }

      // Filter out invalid items
      result.rss.channel.item = items.filter((item) => {
        // Exclude items without a valid image link or title
        return (
          item["g:image_link"] && // Ensure g:image_link exists
          item["g:image_link"].trim() !== "" && // Ensure g:image_link is not an empty string
          item["g:title"] // Ensure g:title exists
        );
      });
  
      // Clean HTML in descriptions (if they exist)
      if (result.rss.channel.item.length > 0) {
        result.rss.channel.item.forEach((item) => {
          if (item["g:description"]) {
            item["g:description"] = cleanHtml(item["g:description"]);
          }
        });
      }

     

    const builder = new xml2js.Builder();
    return builder.buildObject(result);
  } catch (err) {
    console.error("Error parsing XML:", err);
    throw err;
  }
}

export async function GET() {
  try {
  await mongooseConnect()

  // Retrieve all products from the database
  const products = await Product.find();
  if (!products || products.length === 0) {
    return NextResponse.json({ message: "No products found" }, { status: 404 });
  }


  const cleanedProducts = await cleanProductData(products);

  // Generate the XML string from cleaned product data
  const xmlFeed = generateXmlFeed(cleanedProducts);

  // Fix the XML data (e.g., handle missing or malformed image links)
  const feed = await fixXmlData(xmlFeed);

    if (!feed) {
      // Handle the case where no feed was generated
      return NextResponse.json({ message: 'No feed generated' }, { status: 404 });
    }

    // Return the generated XML feed
    return new NextResponse(feed, {
      headers: { 'Content-Type': 'application/xml' },
    });

  } catch (error) {
    console.error('Error generating feed:', error);
    return NextResponse.json({ message: 'Error generating feed' }, { status: 500 });
  }
}


