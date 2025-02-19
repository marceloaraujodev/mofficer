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
// const fetchProducts = async (page, limit) => {
//   let allProducts = [];
//   let url = `https://mofficerbrasil.myshopify.com/admin/api/2024-10/products.json?limit=${limit}&page=${page}&published_status=published`;
//   // &published_status=published`
//   let hasNextPage = true;

//   try {
//     while (hasNextPage) {
//       const response = await axios.get(url, {
//         headers: {
//           "X-Shopify-Access-Token": adminApiAccessToken, // Use the access token for authentication
//         },
//       });

//       allProducts = allProducts.concat(response.data.products);
//       // console.log(allProducts)

//       // check if there is another page
//       const linkHeader = response.headers["link"];
//       if (linkHeader) {
//         const nextPageUrl = linkHeader.match(/<([^>]+)>; rel="next"/);
//         if (nextPageUrl) {
//           url = nextPageUrl[1];
//         } else {
//           hasNextPage = false;
//         }
//       } else {
//         hasNextPage = false;
//       }
//     }

//     // Ensure `allProducts` is an array
//     if (!Array.isArray(allProducts)) {
//       console.error("Invalid products response", allProducts);
//       return [];
//     }

//     // Filter out products without a valid image URL
//     const validProducts = allProducts.filter(product => product.image?.src);

//     // Filter products to include only those with at least one in-stock variant
//     const inStockProducts = validProducts.filter(product =>
//       product.variants.some(variant => variant.inventory_quantity > 0)
//     );

//     return inStockProducts;
//   } catch (error) {
//     console.error("Error fetching products:", error.message);
//     return [];
//   }
// };



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

    // // Filter out products without a valid image URL
    // const validProducts = allProducts.filter(product => 
    //   product.image?.src && product.status === 'active'
    // );


    // // this will leave some variants that are out of stock in the xml
    // // Filter products to include only those with at least one in-stock variant
    // const inStockProducts = validProducts.filter(product =>
    //   product.variants.some(variant => variant.inventory_quantity > 0)
    // );

    // const inStockProducts = validProducts.map(product => console.log(product.variants))

    // ------------ only instock products on the xml list

    // Filter out products without a valid image URL
    const validProducts = allProducts.filter(product => product.image?.src);

    // Filter products to include only those with at least one in-stock variant - only items and variants with stock
    const inStockProducts = validProducts.map(product => {
      // Filter the variants to include only in-stock ones
      const inStockVariants = product.variants.filter(variant => variant.inventory_quantity > 0);

      // If no in-stock variants remain, exclude the product
      if (inStockVariants.length === 0) return null;

      // Return the product with only in-stock variants
      return {
        ...product,
        variants: inStockVariants,
      };
    }).filter(product => product !== null); // Filter out invalid products
    console.log(inStockProducts.length)
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

export async function GET(request) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit')) || 10; // Default 
  console.log(limit)
  try {
  //  const feed = await createXmlFeed();

  const products = await fetchProducts(limit);
  // products.map(product => console.log(product))
  // const activeProducts = products.map(product => product.variants.filter(variant => variant.inventory_quantity > 0));
  // const totalProducts = activeProducts.length;
  // return NextResponse.json({activeProducts, totalProducts})

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



// import axios from 'axios';
// import xml2js from 'xml2js';
// import { NextResponse } from 'next/server';

// // Load environment variables
// import dotenv from 'dotenv';
// dotenv.config();

// // run the route on postman the xml list should be returned in the response

// // Shopify API credentials
// const adminApiAccessToken = process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN;
// const shopName = 'mofficerbrasil';

// const cleanProductData = (products) => {
//   return products
//     .map((product) => {
//       // Exclude products with no image or inactive status
//       if (!product.image?.src || product.status !== 'active') {
//         return null;
//       }

//       // Clean the HTML if present
//       if (product.body_html) {
//         product.body_html = cleanHtml(product.body_html);
//       }

//       // Process variants synchronously
//       product.variants = product.variants
//         .map((variant) => {
//           // Exclude variants without a price or without inventory
//           if (!variant.price) return null;
//           if (!variant.inventory_quantity || variant.inventory_quantity === 0) return null;
//           return variant;
//         })
//         .filter((variant) => variant !== null);

//       // If no valid variants remain, exclude the product
//       if (product.variants.length === 0) return null;

//       return product;
//     })
//     .filter((product) => product !== null);
// };

// // Function to clean HTML tags from descriptions
// function cleanHtml(rawHtml) {
//   // Remove HTML tags
//   let cleaned = rawHtml.replace(/<\/?[^>]+(>|$)/g, "");

//   // Remove all instances of carriage return characters (&#xD;) and any extra whitespace
//   cleaned = cleaned.replace(/&#xD;/g, "").trim();

//   // Remove excessive newlines or unnecessary spaces
//   cleaned = cleaned.replace(/\n+/g, "\n").replace(/\s{2,}/g, " ");

//   return cleaned;
// }

// // Function to fix the XML data
// async function fixXmlData(xmlData) {
//   console.log(xmlData)
//   try {
//     const result = await xml2js.parseStringPromise(xmlData, { trim: true, explicitArray: false });
//     console.log('this should be result', result)
//     // Normalize 'item' to always be an array
//     let items = result?.rss?.channel?.item;
//     if (!Array.isArray(items)) {
//       items = items ? [items] : [];
//     }
//     const missingLinks = [];
//     console.log('this is items', items)

//     // ensures items is always an array
//     if(!Array.isArray(items)){
//       items = items ? [items] : items
//     }

//     items.forEach((item) => {
//       if (!item["g:image_link"] || item["g:image_link"].trim() === "") {
//         const title = item["g:title"] || "No title";
//         const description = item["g:description"] || "No description";
//         missingLinks.push(`Missing or malformed image link in product: ${title}. Description: ${description.substring(0, 50)}`);
//       }

//       if (item["g:description"]) {
//         item["g:description"] = cleanHtml(item["g:description"]);
//       }
//     });

//     if (missingLinks.length > 0) {
//       fs.appendFileSync("missing_links.log", missingLinks.join("\n") + "\n");
//     }

//     const builder = new xml2js.Builder();
//     return builder.buildObject(result);
//   } catch (err) {
//     console.error("Error parsing XML:", err);
//     throw err;
//   }
// }

// // ----------------------New

// const fetchProducts = async (page = 1, limit = 10, batchSize = 50) => {
//   let url = `https://mofficerbrasil.myshopify.com/admin/api/2024-10/products.json?limit=${batchSize}`;
//   let allProducts = [];
//   let currentPage = 1;

//   try {
//     while (true) {
//       const response = await axios.get(url, {
//         headers: {
//           "X-Shopify-Access-Token": adminApiAccessToken,
//         },
//       });

//       // Extract products from the response
//       const batchProducts = response.data.products;
//       allProducts = allProducts.concat(batchProducts);

//       // Check if there is another page
//       const linkHeader = response.headers["link"];
//       if (linkHeader) {
//         const nextPageUrl = linkHeader.match(/<([^>]+)>; rel="next"/);
//         if (nextPageUrl) {
//           url = nextPageUrl[1];
//           currentPage++;
//         } else {
//           break; // No more pages available
//         }
//       } else {
//         break; // No more pages available
//       }

//       // Stop fetching if we have enough products for the requested page
//       const cleanedProducts = cleanProductData(allProducts);
//       if (cleanedProducts.length >= (page * limit)) {
//         break;
//       }
//     }

//     // Clean the products
//     const cleanedProducts = cleanProductData(allProducts);

//     // Paginate the cleaned products
//     const startIndex = (page - 1) * limit;
//     const endIndex = startIndex + limit;
//     return cleanedProducts.slice(startIndex, endIndex);
//   } catch (error) {
//     console.error("Error fetching products:", error.message);
//     if (error.response) {
//       console.error("Response Data:", error.response.data); // Log Shopify's error response
//     }
//     return [];
//   }
// };

// const generateXmlFeed = (products, currentPage, totalPages) => {
//   const feed = {
//     rss: {
//       $: {
//         version: "2.0",
//         "xmlns:g": "http://base.google.com/ns/1.0",
//       },
//       channel: [
//         {
//           title: [`M.Officer`],
//           link: [`https://mofficer.com.br`],
//           description: ["M.Officer"],
//           item: products.map((product) => {
//             const variants =
//               product.variants.length > 0
//                 ? product.variants.map((variant) => ({
//                     "g:variant_id": [variant.id],
//                     "g:variant_title": [variant.title],
//                     "g:variant_price": [`${parseFloat(variant.price).toFixed(2)} BRL`],
//                     "g:variant_sku": [variant.sku],
//                     "g:variant_inventory_quantity": [variant.inventory_quantity],
//                     "g:variant_availability": [variant.inventory_quantity > 0 ? "in stock" : "out of stock"],
//                   }))
//                 : [];
//             return {
//               "g:id": [product.id],
//               "g:title": [product.title],
//               "g:description": [product.body_html || 'No Description available'],
//               "g:link": [`https://${shopName}.com/products/${product.handle}`],
//               "g:image_link": [product.image ? product.image.src : ""],
//               "g:product_type": [product.product_type],
//               "g:condition": ["new"],
//               "g:price": [`${parseFloat(product.variants[0]?.price).toFixed(2) || "0.00"} BRL`],
//               "g:availability": [product.variants[0]?.inventory_quantity > 0 ? "in stock" : "out of stock"],
//               ...(variants.length > 0 ? { "g:variants": variants } : {}),
//             };
//           }),
//         },
//       ],
//     },
//   };
//   const builder = new xml2js.Builder();
//   return builder.buildObject(feed);
// };

// export async function GET(request) {
//   try {
//     // Parse query parameters
//     const url = new URL(request.url);
//     const page = parseInt(url.searchParams.get('page')) || 1;
//     const limit = parseInt(url.searchParams.get('limit')) || 10;

//     // Fetch paginated products
//     const products = await fetchProducts(page, limit);

//     if (products.length === 0) {
//       return NextResponse.json({ message: 'No products found' }, { status: 404 });
//     }

//     // Generate the XML feed with pagination metadata
//     const xmlFeed = generateXmlFeed(products, page, totalPages);
//     // Fix the XML data
//     const fixedData = await fixXmlData(xmlFeed);

//     // Calculate total pages (assuming you know the total number of products)
//     const totalProducts = await getTotalProductCount();
//     const totalPages = Math.ceil(totalProducts / limit);

//       // Set the appropriate filename:
//       const filename = `products_${page}.xml`;


//     // Return the generated XML feed
//     return new NextResponse(fixedData, {
//       headers: { 
//         'Content-Type': 'application/xml',
//         'Content-Disposition': `attachment; filename="${filename}"` 
//       },
//     });
//   } catch (error) {
//     console.error('Error generating feed:', error);
//     return NextResponse.json({ message: 'Error generating feed' }, { status: 500 });
//   }
// }

// const getTotalProductCount = async () => {
//   try {
//     const response = await axios.get(`https://mofficerbrasil.myshopify.com/admin/api/2024-10/products/count.json`, {
//       headers: {
//         "X-Shopify-Access-Token": adminApiAccessToken,
//       },
//     });
//     console.log('this is count for get total product count', response.data.count)
//     return response.data.count;
//   } catch (error) {
//     console.error("Error fetching total product count:", error.message);
//     return 0;
//   }
// };



// // / Function to fetch products from Shopify API
// const fetchProducts = async () => {
//   let allProducts = [];
//   let url = `https://mofficerbrasil.myshopify.com/admin/api/2024-10/products.json?limit=50`;
//   let hasNextPage = true;

//   try {
//     while (hasNextPage) {
//       const response = await axios.get(url, {
//         headers: {
//           "X-Shopify-Access-Token": adminApiAccessToken, // Use the access token for authentication
//         },
//       });

//       allProducts = allProducts.concat(response.data.products);
//       // console.log(allProducts)

//       // check if there is another page
//       const linkHeader = response.headers["link"];
//       if (linkHeader) {
//         const nextPageUrl = linkHeader.match(/<([^>]+)>; rel="next"/);
//         if (nextPageUrl) {
//           url = nextPageUrl[1];
//         } else {
//           hasNextPage = false;
//         }
//       } else {
//         hasNextPage = false;
//       }
//     }

//     // Ensure `allProducts` is an array
//     if (!Array.isArray(allProducts)) {
//       console.error("Invalid products response", allProducts);
//       return [];
//     }

//     // Filter out products without a valid image URL
//     const validProducts = allProducts.filter(product => product.image?.src);

//     // Filter products to include only those with at least one in-stock variant
//     const inStockProducts = validProducts.filter(product =>
//       product.variants.some(variant => variant.inventory_quantity > 0)
//     );

//     return inStockProducts;
//   } catch (error) {
//     console.error("Error fetching products:", error.message);
//     return [];
//   }
// };

// // Function to generate the XML feed from product data
// const generateXmlFeed = (products) => {
//   const feed = {
//     rss: {
//       $: {
//         version: "2.0",
//         "xmlns:g": "http://base.google.com/ns/1.0",
//       },
//       channel: [
//         {
//           title: [`M.Officer`], // Replace with your store's name
//           link: [`https://mofficer.com.br`], // Replace with your store URL, add .br if they have br in it
//           description: ["M.Officer"], // Replace with your store's description
//           item: products.map((product) => {
//             const variants =
//               product.variants.length > 0
//                 ? product.variants.map((variant) => ({
//                     "g:variant_id": [variant.id],
//                     "g:variant_title": [variant.title],
//                     "g:variant_price": [`${parseFloat(variant.price).toFixed(2)} BRL`],
//                     "g:variant_sku": [variant.sku],
//                     "g:variant_inventory_quantity": [variant.inventory_quantity],
//                     "g:variant_availability": [variant.inventory_quantity > 0 ? "in stock" : "out of stock"],
//                   }))
//                 : [];

//             return {
//               "g:id": [product.id],
//               "g:title": [product.title],
//               "g:description": [product.body_html || 'No Description available'],
//               "g:link": [`https://${shopName}.com/products/${product.handle}`],
//               "g:image_link": [product.image ? product.image.src : ""],
//               "g:product_type": [product.product_type],
//               "g:condition": ["new"],
//               "g:price": [`${parseFloat(product.variants[0]?.price).toFixed(2) || "0.00"} BRL`], // Default price for standalone
//               "g:availability": [product.variants[0]?.inventory_quantity > 0 ? "in stock" : "out of stock"],
//               ...(variants.length > 0 ? { "g:variants": variants } : {}),
//             };
//           }),
//         },
//       ],
//     },
//   };

//   // Convert JSON object to XML string
//   const builder = new xml2js.Builder();
//   return builder.buildObject(feed);
// };

// // Main function to fetch products and create the XML file
// const createXmlFeed = async () => {
//   const products = await fetchProducts();
//   if (products.length === 0) {
//     console.log("No products found!");
//     return;
//   }

//   // Clean product data
//   const cleanedProducts = await cleanProductData(products);

//   // Generate the XML string from cleaned product data
//   const xmlFeed = generateXmlFeed(cleanedProducts);

//   // Fix the XML data (e.g., handle missing or malformed image links)
//   const fixedData = await fixXmlData(xmlFeed);

//   return fixedData
// };

// const cleanProductData = async (products) => {
//   const cleanedProducts = await Promise.all(products.map(async (product) => {
//     // Processing logic for each product
//     if (!product.image?.src || product.status !== 'active') {
//       return null;
//     }

//     if (product.body_html) {
//       product.body_html = cleanHtml(product.body_html);
//     }

//     product.variants = await Promise.all(
//       product.variants.map(async (variant) => {
//         // Processing for each variant asynchronously

//         // Exclude variants without a price (Google requires it)
//         if (!variant.price) return null;

//         // Exclude variants with inventory_quantity of 0 or undefined/null
//         if (!variant.inventory_quantity || variant.inventory_quantity === 0) return null;

//         return variant;
//       })
//     );

//     // Remove null variants (those without a price)
//     product.variants = product.variants.filter(variant => variant !== null);

//     // If no valid variants exist, exclude the entire product
//     if (product.variants.length === 0) return null;

//     return product;
//   }));

//   // Filter out the null values after async processing
//   return cleanedProducts.filter(product => product !== null);
// };


// export async function GET() {
//   try {
//  const feed = await createXmlFeed();

//     if (!feed) {
//       // Handle the case where no feed was generated
//       return NextResponse.json({ message: 'No feed generated' }, { status: 404 });
//     }

//     // Return the generated XML feed
//     return new NextResponse(feed, {
//       headers: { 'Content-Type': 'application/xml' },
//     });

//   } catch (error) {
//     console.error('Error generating feed:', error);
//     return NextResponse.json({ message: 'Error generating feed' }, { status: 500 });
//   }
// }



// //  old one Function to clean and format product data
// const cleanProductData = (products) => {
//   let imgMissing = 0;
//   const cleanProducts = products.filter((product) => {

//     // Default image handling
//     if (!product.image?.src || product.status !== 'active') {
//       imgMissing++; // just a counter to see how many images are missing
//       return false
//     }

//     // Clean description
//     if (product.body_html) {
//       product.body_html = cleanHtml(product.body_html);
//     }

//     // Process variants or handle standalone product
//     if (product.variants.length === 0) {
//       // Assign default variant-like properties for standalone
//       product.variants = [
//         {
//           price: product.price || "0.00",
//           inventory_quantity: product.inventory_quantity || 0,
//           sku: product.sku || "default-sku",
//         },
//       ];
//     } else {
//       product.variants = product.variants.map((variant) => {
//         if (!variant.price) variant.price = "0.00";
//         if (variant.inventory_quantity == null) variant.inventory_quantity = 0;
//         return variant;
//       }).filter((variant) => variant.inventory_quantity > 0)
//     }
//     return true;
//   });

//   console.log("Missing Images:", imgMissing);
//   console.log("total number of clean products:", cleanProducts.length);
//   return cleanProducts;
// };

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
