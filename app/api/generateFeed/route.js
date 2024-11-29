import axios from 'axios';
import xml2js from 'xml2js';
import { NextResponse } from 'next/server';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Shopify API credentials
const adminApiAccessToken = process.env.MOFFICER_ADMIN_API_ACCESS_TOKEN;
const shopName = 'mofficerbrasil';

// Function to fetch products from Shopify API
const fetchProducts = async () => {
  let allProducts = [];
  let url = `https://${shopName}.myshopify.com/admin/api/2024-10/products.json?limit=50`;
  let hasNextPage = true;

  try {
    while (hasNextPage) {
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": adminApiAccessToken,
        },
      });

      allProducts = allProducts.concat(response.data.products);

      const linkHeader = response.headers['link'];
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

    return allProducts.filter(product => product.variants.some(variant => variant.inventory_quantity > 0));
  } catch (error) {
    console.error("Error fetching products:", error.message);
    return [];
  }
};

// Function to clean product data
const cleanProductData = (products) => {
  return products.filter(product => product.image?.src && product.status === 'active')
                 .map(product => {
                   product.variants = product.variants.map(variant => ({
                     ...variant,
                     price: variant.price || '0.00',
                     inventory_quantity: variant.inventory_quantity || 0,
                   }));
                   return product;
                 });
};

// Function to generate the XML feed from product data
const generateXmlFeed = (products) => {
  const feed = {
    rss: {
      $: {
        version: '2.0',
        xmlns: 'http://base.google.com/ns/1.0',
      },
      channel: [{
        title: ['M.Officer'],
        link: [`https://${shopName}.com.br`],
        description: ['Your Store Description'],
        item: products.map(product => ({
          'g:id': [product.id],
          'g:title': [product.title],
          'g:description': [product.body_html || 'No description available'],
          'g:link': [`https://${shopName}.com/products/${product.handle}`],
          'g:image_link': [product.image?.src || ''],
          'g:product_type': [product.product_type],
          'g:price': [`${parseFloat(product.variants[0]?.price).toFixed(2)} BRL`],
          'g:availability': [product.variants[0]?.inventory_quantity > 0 ? 'in stock' : 'out of stock'],
        })),
      }],
    },
  };

  const builder = new xml2js.Builder();
  return builder.buildObject(feed);
};
// Run the main function
// createXmlFeed();

export async function GET() {
  try {
    const products = await fetchProducts();
    if (!products.length) {
      return NextResponse.json({ message: 'No products found!' }, { status: 404 });
    }

    const cleanedProducts = cleanProductData(products);
    const xmlFeed = generateXmlFeed(cleanedProducts);

    // Return the generated XML feed
    return new NextResponse(xmlFeed, {
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
