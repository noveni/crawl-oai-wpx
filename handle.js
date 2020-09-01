var fs = require('fs');
var Crawler = require("crawler");
var HTMLParser = require('node-html-parser');
// var OaiPmh = require('oai-pmh');
var parser = require('fast-xml-parser');
var createCsvWriter = require('csv-writer').createObjectCsvWriter;

let publicationsArray = [];

var directCrawler = new Crawler({});

require('dotenv').config();

const baseUrl = process.env.BASEURL;
const baseOaiPmh = process.env.BASEURLOAIPMH;
const requestBase = process.env.REQUEST_BASE;
const WpSiteUrl = process.env.WPSITE;
const WpEmail = process.env.WPEMAIL;
const limit = 10;
const buildDir = './dist';



const initCrawler = () => {

  // Base Direct Crawler to get all Handle
  directCrawler.direct({
    uri: baseUrl + requestBase + limit,
    skipEventRequest: false, // default to true, direct requests won't trigger Event:'request'
    callback: function(error, response) {
      if(error) {
          console.log(error)
      } else {
        const handleLinks = getAllHandlesFromDOM(response.body);
        queueCrawler.queue(handleLinks);
      }
    }
  });
}

// function to crawl one item 
const queueCrawler = new Crawler({
  maxConnections : 10,
  // This will be called for each crawled page
  callback : function (error, res, done) {
      if(error){
        console.log('Error');
        console.error(error);
      }else{
        xmlParser(res.body);
      }
      done();
  }
});

queueCrawler.on('drain',function(){
  // For example, release a connection to database.
  console.log('Write Stuff into CSV');

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
  }
  // writeCSVFile(publicationsArray);
  writeWXR(publicationsArray);  
});


// Function to get all handle in an array
const getAllHandlesFromDOM = (bodyResponse) => {
  const root = HTMLParser.parse(bodyResponse);
  if (!root) {
    return false
  }
  const tableOfLink = root.querySelector('#tabscontainer');
  if (!tableOfLink) {
    return false;
  }
  const titlesDiv = tableOfLink.querySelectorAll('.title');
  if (titlesDiv.length) {
    console.log(`Total Of Title in Table of link : ${titlesDiv.length}`);
    return titlesDiv.map((title) => {
      if (title.getAttribute('href')) {
        const url = title.getAttribute('href').replace('/handle/', '');
        return baseOaiPmh + url;
      }
    });
  }
  return false;
}

// Function to parse and filter 
const xmlParser = (xmlToParse) => {
  var options = {
    ignoreAttributes : false,
    ignoreNameSpace : true,
    allowBooleanAttributes : false,
    parseNodeValue : true,
    parseAttributeValue : false,
    trimValues: true,
  };


  try{
    var jsonObj = parser.parse(xmlToParse, options, true);
    const data = jsonObj['OAI-PMH'].GetRecord.record.metadata.dc;

    let title;
    if( Array.isArray(data.title)) {
      const foundTitle = data.title.find(title => {
        if (title['@_lang']) {
          if (title['@_lang'] = 'en') {
            return true;
          }
        }
        return false;
      });
      title = foundTitle ? foundTitle['#text'] : data.title[0];
    } else {
      title = data.title;
    }

    const publicationInfo = {
      title: title,
      creator: Array.isArray(data.creator) ? data.creator : [data.creator],
      date: Array.isArray(data.date) ? data.date[0] : data.date,
      url: Array.isArray(data.identifier) ? data.identifier[0] : data.identifier,
    };
    publicationsArray.push(publicationInfo)
  } catch(error){
    console.log(error.message)
  }
}

// Function to Write CSV File
const writeCSVFile = (publicationsArray) => {

  const csvWriter = createCsvWriter({
    path: buildDir + '/publications.csv',
    header: [
        {id: 'title', title: 'Title'},
        {id: 'creator', title: 'Author'},
        {id: 'url', title: 'Url'},
        {id: 'date', title: 'Date'},
    ]
  });

  const formattedToCSV = publicationsArray.map((publication) => {
    let formattedPublication = publication
    if ( Array.isArray(publication.creator)) {
      formattedPublication.creator = `'${publication.creator.join("','")}'`;
    }
    return formattedPublication;
  })

  csvWriter.writeRecords(formattedToCSV)       // returns a promise
    .then(() => {
        console.log('...Done');
    });
}

const writeWXR = (publicationsArray) => {
  let xmlHeader = '<?xml version="1.0" encoding="UTF-8" ?>' + '\r\n' +
                    ' <rss version="2.0"' + '\r\n' + 
                    '    xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"' + '\r\n' +
                    '    xmlns:content="http://purl.org/rss/1.0/modules/content/"' + '\r\n' +
                    '    xmlns:wfw="http://wellformedweb.org/CommentAPI/"' + '\r\n' +
                    '    xmlns:dc="http://purl.org/dc/elements/1.1/"' + '\r\n' +
                    '    xmlns:wp="http://wordpress.org/export/1.2/"' + '\r\n' +
                    '>' + '\r\n';
  xmlHeader += '<channel>' + '\r\n' +
  '  <title>Coma Science Group</title>' + '\r\n' +
  '  <link>' + WpSiteUrl + '</link>' + '\r\n' +
  '  <description></description>' + '\r\n' +
  '  <pubDate>Tue, 01 Sep 2020 03:24:49 +0000</pubDate>' + '\r\n' +
  '  <language>en-US</language>' + '\r\n' +
  '  <wp:wxr_version>1.2</wp:wxr_version>' + '\r\n' +
  '  <wp:base_site_url>' + WpSiteUrl + '</wp:base_site_url>' + '\r\n' +
  '  <wp:base_blog_url>' + WpSiteUrl + '</wp:base_blog_url>' + '\r\n' +
  '  <wp:author><wp:author_id>1</wp:author_id><wp:author_login><![CDATA[' + WpEmail + ']]></wp:author_login><wp:author_email><![CDATA[' + WpEmail + ']]></wp:author_email><wp:author_display_name><![CDATA[' + WpEmail + ']]></wp:author_display_name><wp:author_first_name><![CDATA[]]></wp:author_first_name><wp:author_last_name><![CDATA[]]></wp:author_last_name></wp:author>' + '\r\n';

  let items = '';
  const publicationLn = publicationsArray.length;
  for (let index = 0; index < publicationLn; index++) {
    items += writeWXRItem(publicationsArray[index]);
  }
  const xmlFooter = '</channel>' + '\r\n' +
  '   </rss>' + '\r\n';

  const contentFile = xmlHeader.concat(items, xmlFooter);

  var fs = require('fs');

  fs.writeFile(buildDir + '/comaScience-publications.xml', contentFile, function (err) {
    if (err) throw err;
    console.log('Saved!');
  });
}

const writeWXRItem = (publication) => {
  let item = '    <item>' + '\r\n' +
  '  <title>' +  publication.title + '</title>' + '\r\n' +
  '  <pubDate>Tue, 1 Sep 2020 00:00:01 +0000</pubDate>' + '\r\n' +
  '  <dc:creator><![CDATA[' + WpEmail + ']]></dc:creator>' + '\r\n' +
  '  <description></description>' + '\r\n' +
  '  <content:encoded><![CDATA[]]></content:encoded>' + '\r\n' +
  '  <excerpt:encoded><![CDATA[]]></excerpt:encoded>' + '\r\n' +
  '  <wp:post_date><![CDATA[2020-09-01 00:00:01]]></wp:post_date>' + '\r\n' +
  '  <wp:post_date_gmt><![CDATA[2020-09-01 0-00:00:01]]></wp:post_date_gmt>' + '\r\n' +
  '  <wp:comment_status><![CDATA[closed]]></wp:comment_status>' + '\r\n' +
  '  <wp:ping_status><![CDATA[closed]]></wp:ping_status>' + '\r\n' +
  '  <wp:post_name><![CDATA[' + publication.title + ']]></wp:post_name>' + '\r\n' +
  '  <wp:status><![CDATA[publish]]></wp:status>' + '\r\n' +
  '  <wp:post_parent>0</wp:post_parent>' + '\r\n' +
  '  <wp:menu_order>0</wp:menu_order>' + '\r\n' +
  '  <wp:post_type><![CDATA[theme_publication]]></wp:post_type>' + '\r\n' +
  '  <wp:post_password><![CDATA[]]></wp:post_password>' + '\r\n' +
  '  <wp:is_sticky>0</wp:is_sticky>' + '\r\n' +
	'													<wp:postmeta>' + '\r\n' +
	'	<wp:meta_key><![CDATA[_edit_last]]></wp:meta_key>' + '\r\n' +
	'	<wp:meta_value><![CDATA[1]]></wp:meta_value>' + '\r\n' +
  '	</wp:postmeta>' + '\r\n';
  
  
  item += writeWXRAuthor(publication.creator);

	item += '						<wp:postmeta>' + '\r\n' +
	'	<wp:meta_key><![CDATA[_crb_publication_url]]></wp:meta_key>' + '\r\n' +
	'	<wp:meta_value><![CDATA[' + publication.url + ']]></wp:meta_value>' + '\r\n' +
	'	</wp:postmeta>' + '\r\n' +
	'						<wp:postmeta>' + '\r\n' +
	'	<wp:meta_key><![CDATA[_crb_publication_date]]></wp:meta_key>' + '\r\n' +
	'	<wp:meta_value><![CDATA[' + publication.date + ']]></wp:meta_value>' + '\r\n' +
	'	</wp:postmeta>' + '\r\n' +
  '</item>' + '\r\n';
  return item;
}

const writeWXRAuthorMetaGroup = (i) => {
  const postMetaGroup = '<wp:postmeta>' + '\r\n' +
	'	<wp:meta_key><![CDATA[_crb_publication_authors_group|||' + i + '|value]]></wp:meta_key>' + '\r\n' +
	'	<wp:meta_value><![CDATA[_]]></wp:meta_value>' + '\r\n' +
  '</wp:postmeta>' + '\r\n';

  return postMetaGroup;
}
const writeWXRAuthorMeta = (author, i) => {
  const postMeta = '<wp:postmeta>' + '\r\n' +
	'	<wp:meta_key><![CDATA[_crb_publication_authors_group|crb_publication_author|' + i + '|0|value]]></wp:meta_key>' + '\r\n' +
	'	<wp:meta_value><![CDATA[' + author + ']]></wp:meta_value>' + '\r\n' +
  '	</wp:postmeta>' + '\r\n';
  return postMeta;
}

const writeWXRAuthor = (authors) => {
  let postMetaAuthorWXR = '';
  const authorsLn = authors.length;
  for (let index = 0; index < authorsLn; index++) {
    postMetaAuthorWXR += writeWXRAuthorMetaGroup(index);
  }
  for (let index = 0; index < authorsLn; index++) {
    postMetaAuthorWXR += writeWXRAuthorMeta(authors[index], index);
  }
  return postMetaAuthorWXR;
}

initCrawler();
