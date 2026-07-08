
# Add cloudflare gpg key
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg | sudo tee /usr/share/keyrings/cloudflare-public-v2.gpg >/dev/null

# Add this repo to your apt repositories
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# install cloudflared
sudo apt-get update && sudo apt-get install cloudflared

sudo cloudflared service install eyJhIjoiNjM2ODM3ODlmYTdjOTc4Yjc1MDQxZWY5MTBjY2JlMjAiLCJ0IjoiNGQ4MjI3ZDYtNGU5ZS00OGU0LWFlNWEtMmNkZTQ4M2UyMzI2IiwicyI6Ik1EYzBPV1ZtTldFdFpEUmlaQzAwWTJVeExXSTRPVEF0T1dZeVpEazFPR05pTjJWaCJ9




python3 -m venv STAI100_SwiftMemo_venv

source STAI100_SwiftMemo_venv/bin/activate


swiftmemo.balingit.me