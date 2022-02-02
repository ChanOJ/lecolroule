# Site web du Col Roulé

Static website composed of 2 html files (one FR and one EN) and external resources (JS & images).

## 

## AWS

The site is supposed to be hosted on S3, and served via CloudFront.

Two Lambdas @ Edge are needed to :
- modify the HTTP headers to comply to the security state-of-the-art (cf Dareboost & Google Pagespeed)
- handle the URL rewriting (using slashes instead of fragment parts) for SEO matters

## TO DO

### CI/CD

Currently no CD/CD.

### AWS

Cloud Formation to do, currently everything has been setup on AWS using the console :
- S3 bucket
- Route53 (DNS)
- CloudFront (CDN)
- Lambdas @ Edge (executed in CloudFront)

### BIMI

The BIMI setup is also not yet finished, the SVG file isn't compliant with the standard (too big and complex).

#### SEO

Even is all the URLs are SEO compliant (using slashes), only the two roots (FR & EN) are indexable because all the routes are returning the same exact HTML code to the browser. We should add some javascript to inject only the required HTML contents (coming from a third file) for each route. Another solution may be to use a static website generator.
