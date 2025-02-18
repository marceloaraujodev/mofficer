import axios from 'axios';
import xml2js from 'xml2js';
import { NextResponse } from 'next/server';
import dotenv from 'dotenv';
dotenv.config();

// Shopify API credentials
const adminApiAccessToken = process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN;
const shopName = 'mofficerbrasil';

// Existing functions (cleanProductData, cleanHtml, fixXmlData, fetchProducts, generateXmlFeed, getTotalProductCount)
// Remain unchanged...

// Generate Index File
function generateIndexFile(totalPages) {
  const index = {
    sitemapindex: {
      $: { xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9" },
      sitemap: Array.from({ length: totalPages }, (_, i) => ({
        loc: [`https://${shopName}.com.br/api/google-feed?page=${i + 1}`],
      })),
    },
  };
  const builder = new xml2js.Builder();
  return builder.buildObject(index);
}

export async function GET(request) {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || null; // Page is optional
    const limit = parseInt(url.searchParams.get('limit')) || 50; // Default limit per page

    // Fetch total product count
    const totalProducts = await getTotalProductCount();
    const totalPages = Math.ceil(totalProducts / limit);

    if (!page) {
      // Serve the index file if no page is specified
      const indexFile = generateIndexFile(totalPages);
      return new NextResponse(indexFile, {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Validate page number
    if (page < 1 || page > totalPages) {
      return NextResponse.json({ message: "Invalid page number" }, { status: 400 });
    }

    // Fetch paginated products
    const products = await fetchProducts(page, limit);
    if (products.length === 0) {
      return NextResponse.json({ message: "No products found" }, { status: 404 });
    }

    // Generate the XML feed
    const xmlFeed = generateXmlFeed(products, page, totalPages);

    // Fix the XML data
    const fixedData = await fixXmlData(xmlFeed);

    // Return the generated XML feed
    const filename = `products_${page}.xml`;
    return new NextResponse(fixedData, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error generating feed:", error);
    return NextResponse.json({ message: "Error generating feed" }, { status: 500 });
  }
}


const getTotalProductCount = async () => {
  try {
    const response = await axios.get(`https://mofficerbrasil.myshopify.com/admin/api/2024-10/products/count.json`, {
      headers: {
        "X-Shopify-Access-Token": adminApiAccessToken,
      },
    });
    console.log('this is count for get total product count', response.data.count)
    return response.data.count;
  } catch (error) {
    console.error("Error fetching total product count:", error.message);
    return 0;
  }
};

const fetchProducts = async (page = 1, limit = 10, batchSize = 50) => {
  let url = `https://mofficerbrasil.myshopify.com/admin/api/2024-10/products.json?limit=${batchSize}`;
  let allProducts = [];
  let currentPage = 1;

  try {
    while (true) {
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": adminApiAccessToken,
        },
      });

      // Extract products from the response
      const batchProducts = response.data.products;
      allProducts = allProducts.concat(batchProducts);

      // Check if there is another page
      const linkHeader = response.headers["link"];
      if (linkHeader) {
        const nextPageUrl = linkHeader.match(/<([^>]+)>; rel="next"/);
        if (nextPageUrl) {
          url = nextPageUrl[1];
          currentPage++;
        } else {
          break; // No more pages available
        }
      } else {
        break; // No more pages available
      }

      // Stop fetching if we have enough products for the requested page
      const cleanedProducts = cleanProductData(allProducts);
      if (cleanedProducts.length >= (page * limit)) {
        break;
      }
    }

    // Clean the products
    const cleanedProducts = cleanProductData(allProducts);

    // Paginate the cleaned products
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    return cleanedProducts.slice(startIndex, endIndex);
  } catch (error) {
    console.error("Error fetching products:", error.message);
    if (error.response) {
      console.error("Response Data:", error.response.data); // Log Shopify's error response
    }
    return [];
  }
};

const generateXmlFeed = (products, currentPage, totalPages) => {
  const feed = {
    rss: {
      $: {
        version: "2.0",
        "xmlns:g": "http://base.google.com/ns/1.0",
      },
      channel: [
        {
          title: [`M.Officer`],
          link: [`https://mofficer.com.br`],
          description: ["M.Officer"],
          item: products.map((product) => {
            const variants =
              product.variants.length > 0
                ? product.variants.map((variant) => ({
                    "g:variant_id": [variant.id],
                    "g:variant_title": [variant.title],
                    "g:variant_price": [`${parseFloat(variant.price).toFixed(2)} BRL`],
                    "g:variant_sku": [variant.sku],
                    "g:variant_inventory_quantity": [variant.inventory_quantity],
                    "g:variant_availability": [variant.inventory_quantity > 0 ? "in stock" : "out of stock"],
                  }))
                : [];
            return {
              "g:id": [product.id],
              "g:title": [product.title],
              "g:description": [product.body_html || 'No Description available'],
              "g:link": [`https://${shopName}.com/products/${product.handle}`],
              "g:image_link": [product.image ? product.image.src : ""],
              "g:product_type": [product.product_type],
              "g:condition": ["new"],
              "g:price": [`${parseFloat(product.variants[0]?.price).toFixed(2) || "0.00"} BRL`],
              "g:availability": [product.variants[0]?.inventory_quantity > 0 ? "in stock" : "out of stock"],
              ...(variants.length > 0 ? { "g:variants": variants } : {}),
            };
          }),
        },
      ],
    },
  };
  const builder = new xml2js.Builder();
  return builder.buildObject(feed);
};

async function fixXmlData(xmlData) {
  console.log(xmlData)
  try {
    const result = await xml2js.parseStringPromise(xmlData, { trim: true, explicitArray: false });
    console.log('this should be result', result)
    // Normalize 'item' to always be an array
    let items = result?.rss?.channel?.item;
    if (!Array.isArray(items)) {
      items = items ? [items] : [];
    }
    const missingLinks = [];
    console.log('this is items', items)

    // ensures items is always an array
    if(!Array.isArray(items)){
      items = items ? [items] : items
    }

    items.forEach((item) => {
      if (!item["g:image_link"] || item["g:image_link"].trim() === "") {
        const title = item["g:title"] || "No title";
        const description = item["g:description"] || "No description";
        missingLinks.push(`Missing or malformed image link in product: ${title}. Description: ${description.substring(0, 50)}`);
      }

      if (item["g:description"]) {
        item["g:description"] = cleanHtml(item["g:description"]);
      }
    });

    if (missingLinks.length > 0) {
      fs.appendFileSync("missing_links.log", missingLinks.join("\n") + "\n");
    }

    const builder = new xml2js.Builder();
    return builder.buildObject(result);
  } catch (err) {
    console.error("Error parsing XML:", err);
    throw err;
  }
}

const cleanProductData = (products) => {
  return products
    .map((product) => {
      // Exclude products with no image or inactive status
      if (!product.image?.src || product.status !== 'active') {
        return null;
      }

      // Clean the HTML if present
      if (product.body_html) {
        product.body_html = cleanHtml(product.body_html);
      }

      // Process variants synchronously
      product.variants = product.variants
        .map((variant) => {
          // Exclude variants without a price or without inventory
          if (!variant.price) return null;
          if (!variant.inventory_quantity || variant.inventory_quantity === 0) return null;
          return variant;
        })
        .filter((variant) => variant !== null);

      // If no valid variants remain, exclude the product
      if (product.variants.length === 0) return null;

      return product;
    })
    .filter((product) => product !== null);
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