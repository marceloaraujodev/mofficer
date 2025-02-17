import axios from 'axios';
import xml2js from 'xml2js';
import { NextResponse } from 'next/server';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// run the route on postman the xml list should be returned in the response

// Shopify API credentials
const adminApiAccessToken = process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN;
const shopName = 'mofficerbrasil';

// / Function to fetch products from Shopify API
const fetchProducts = async () => {
  let allProducts = [];
  let url = `https://mofficerbrasil.myshopify.com/admin/api/2024-10/products.json?limit=50`;
  let hasNextPage = true;

  try {
    while (hasNextPage) {
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": adminApiAccessToken, // Use the access token for authentication
        },
      });

      allProducts = allProducts.concat(response.data.products);
      // console.log(allProducts)

      // check if there is another page
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

    const products = allProducts;

    // Filter products to include only those with at least one in-stock variant
    const inStockProducts = products.filter((product) => {
      // Check if there's any variant with inventory_quantity > 0
      return product.variants.some((variant) => variant.inventory_quantity > 0);
    });

    return inStockProducts;
  } catch (error) {
    console.error("Error fetching products:", error.message);
    return [];
  }
};

// Function to generate the XML feed from product data
const generateXmlFeed = (products) => {
  const feed = {
    rss: {
      $: {
        version: "2.0",
        "xmlns:g": "http://base.google.com/ns/1.0",
      },
      channel: [
        {
          title: [`M.Officer`], // Replace with your store's name
          link: [`https://mofficer.com.br`], // Replace with your store URL, add .br if they have br in it
          description: ["Your Store Description"], // Replace with your store's description
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
              "g:price": [`${parseFloat(product.variants[0]?.price).toFixed(2) || "0.00"} BRL`], // Default price for standalone
              "g:availability": [product.variants[0]?.inventory_quantity > 0 ? "in stock" : "out of stock"],
              ...(variants.length > 0 ? { "g:variants": variants } : {}),
            };
          }),
        },
      ],
    },
  };

  // Convert JSON object to XML string
  const builder = new xml2js.Builder();
  return builder.buildObject(feed);
};


// Function to clean and format product data
const cleanProductData = (products) => {
  let imgMissing = 0;
  const cleanProducts = products.filter((product) => {

    // Default image handling
    if (!product.image?.src || product.status !== 'active') {
      imgMissing++; // just a counter to see how many images are missing
      return false
    }

    // Clean description
    if (product.body_html) {
      product.body_html = cleanHtml(product.body_html);
    }

    // Process variants or handle standalone product
    if (product.variants.length === 0) {
      // Assign default variant-like properties for standalone
      product.variants = [
        {
          price: product.price || "0.00",
          inventory_quantity: product.inventory_quantity || 0,
          sku: product.sku || "default-sku",
        },
      ];
    } else {
      product.variants = product.variants.map((variant) => {
        if (!variant.price) variant.price = "0.00";
        if (variant.inventory_quantity == null) variant.inventory_quantity = 0;
        return variant;
      }).filter((variant) => variant.inventory_quantity > 0)
    }
    return true;
  });

  console.log("Missing Images:", imgMissing);
  console.log("total number of clean products:", cleanProducts.length);
  return cleanProducts;
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
    const items = result.rss.channel.item || [];
    const missingLinks = [];

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

// Main function to fetch products and create the XML file
const createXmlFeed = async () => {
  const products = await fetchProducts();
  if (products.length === 0) {
    console.log("No products found!");
    return;
  }

  // Clean product data
  const cleanedProducts = cleanProductData(products);

  // Generate the XML string from cleaned product data
  const xmlFeed = generateXmlFeed(cleanedProducts);

  // Fix the XML data (e.g., handle missing or malformed image links)
  const fixedData = await fixXmlData(xmlFeed);

  return fixedData
};

export async function GET() {
  try {
 const feed = await createXmlFeed();

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

//////-----------------------------

// // doc structure:

// id: 4334412267635,
// title: 'BERMUDA JEANS C3 LIGHT BLUE',
// body_html: '',
// vendor: 'M.Officer',
// product_type: 'BERMUDAS',
// created_at: '2019-11-07T09:58:44-03:00',
// handle: 'bermuda-jeans-c3-light-blue',
// updated_at: '2024-05-10T10:01:30-03:00',
// published_at: null,
// template_suffix: '',
// published_scope: 'web',
// tags: 'amz-feminino, amzcat-Clothing, amzcor-blue_11820200896434, amzcor-blue_11820200896436, amzcor-blue_11820200896438, amzcor-blue_11820200896440, amzcor-blue_11820200896442, amzcor-blue_11820200896444, amzrbn-17682117011, amzrbn-17682127011, amzsubcat-Shorts, amztamanho-34_11820200896434, amztamanho-36_11820200896436, amztamanho-38_11820200896438, amztamanho-40_11820200896440, amztamanho-42_11820200896442, amztamanho-44_11820200896444, Azul, colecao-82 M.O, grupo-BERMUDAS, linha-02, out-of-stock-police, sexo-FEMININO, SG-FEMININO-SHORTS, subgrupo-BERMUDA JEANS',
// status: 'archived',
// admin_graphql_api_id: 'gid://shopify/Product/4334412267635',
// variants: [ [Object], [Object], [Object], [Object], [Object], [Object] ],
// options: [ [Object], [Object] ],
// images: [ [Object], [Object] ],
// image: {
//   id: 13615678095475,
//   alt: null,
//   position: 1,
//   product_id: 4334412267635,
//   created_at: '2019-12-17T16:56:53-03:00',
//   updated_at: '2019-12-17T16:56:57-03:00',
//   admin_graphql_api_id: 'gid://shopify/ProductImage/13615678095475',
//   width: 1000,
//   height: 1000,
//   src: 'https://cdn.shopify.com/s/files/1/0015/4219/3267/products/118202008_1.jpg?v=1576612617',
//   variant_ids: []

/*
  variants object

   product_id: 4334412267635,
      id: 31092449935475,
      title: '44 / CLARA',
      price: '159.90',
      position: 6,
      inventory_policy: 'deny',
      compare_at_price: null,
      option1: '44',
      option2: 'CLARA',
      option3: null,
      created_at: '2019-11-07T09:58:45-03:00',
      updated_at: '2024-05-10T10:01:30-03:00',
      taxable: false,
      barcode: null,
      fulfillment_service: 'manual',
      grams: 279,
      inventory_management: 'shopify',
      requires_shipping: true,
      sku: '11820200896444',
      weight: 0.279,
      weight_unit: 'kg',
      inventory_item_id: 32578219933811,
      inventory_quantity: 0,
      old_inventory_quantity: 0,
      admin_graphql_api_id: 'gid://shopify/ProductVariant/31092449935475',
      image_id: null
    }
*/
