/* Differential corpus: the crypto that mbedTLS has no scheme for (Ed25519, Ed448, X25519, X448, DSA), password-protected keys,
   SHA-3 and SHAKE, and PKCS#12 files through tls. Fixtures below were made by Node.js and openssl. */
const crypto = require("crypto");
const tls = require("tls");
const F = {
 "ed25519": {
  "priv": "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGHEawI07EOaZYMGNuccdqo+yanlbfz0St/C8DtdPyzN\n-----END PRIVATE KEY-----\n",
  "pub": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAQVWrOYsd5Qi+GJp1GQx6OaD18OQStaxspNVqpRdv0VM=\n-----END PUBLIC KEY-----\n",
  "sig": "YMRaH9+yZa6ASGv+Pj5sYjH+FtpvQjPy7qmjuY9uLPqGeEsPcxp/asLsKCQ1IN7hP4ggHDmDKwKkxbAIQ+NbAg=="
 },
 "ed448": {
  "priv": "-----BEGIN PRIVATE KEY-----\nMEcCAQAwBQYDK2VxBDsEOeXmNhjfP59BPGyclVeWxAJMOrYzmTsC1picZI/3lMwS\nsgH0jIFmWzRAlzMTw9SVsk4wmwjPwVE18w==\n-----END PRIVATE KEY-----\n",
  "pub": "-----BEGIN PUBLIC KEY-----\nMEMwBQYDK2VxAzoA0b8lC/u0HyUoW2/KnlVEVP+1L1+yQljQAbma2cJmgqpRftrj\nuPEZCL+BSuC3qS0ImyMDAdkT7RqA\n-----END PUBLIC KEY-----\n",
  "sig": "G8M6dG629v/9yegxvLPXBywchgQC52L3hym2iH57+dh5WHeY4lxUJHdhNpmGDERiCm7eGI2HPRYA2Q7GGJIBhgsMXanC5aqwofGpy4hlaIgdrG+3Z8QNopA1Sg4R8hwCMxDzfVcIWlbi0aoJt3MKNhMA"
 },
 "x25519": {
  "priv": "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VuBCIEIOCMJhbAI3/qs89Zl8eEJt8tjlfnp1qjIz++9sIzIjZj\n-----END PRIVATE KEY-----\n",
  "pub": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEAhFAOBElTo99hkaFu+w+FkvsZZecFF7xaThuOLjXYwRI=\n-----END PUBLIC KEY-----\n"
 },
 "x448": {
  "priv": "-----BEGIN PRIVATE KEY-----\nMEYCAQAwBQYDK2VvBDoEOLSr/u7J4fJXWersXdGDeeOP9jsIp8sx/KK9CgtkeUzi\nGUnXLumGCRETK8W9Jm+U1sxnn5UhMdaW\n-----END PRIVATE KEY-----\n",
  "pub": "-----BEGIN PUBLIC KEY-----\nMEIwBQYDK2VvAzkAy+LigQJewr9Tffhi/pTv/sf+EkfT9k6xR51suRLJOI9diHm6\n4qvp/MrwYBw2ZqM0GEVAhyy2Sgc=\n-----END PUBLIC KEY-----\n"
 },
 "xdh": {
  "a": "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VuBCIEIFiKVOrq5SXbIbtZ8D16faYKM46my6aw7XNO++PE/jJV\n-----END PRIVATE KEY-----\n",
  "b": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEA9Sz6VITgYX/Vtp/qJq+TCqRjMANkXeGJYrSuNol9dVU=\n-----END PUBLIC KEY-----\n",
  "secret": "fc28df2befc07be631be34620a66593dbe8ab3d5034aad0eb0d482ebc19c7919"
 },
 "xdh448": {
  "a": "-----BEGIN PRIVATE KEY-----\nMEYCAQAwBQYDK2VvBDoEOFBWu8Hnrd4/gOc8VvY7MAU+t96Q7n7oY43qpwZ2uScf\ngS86SIuDGTSces1cSiiUDCBSpkQi5O6f\n-----END PRIVATE KEY-----\n",
  "b": "-----BEGIN PUBLIC KEY-----\nMEIwBQYDK2VvAzkA6Wa1+ZtJ9OX2uF8n5xRm8xbhyiVfeXtv3QYu4A3NeVpj8AYz\naSDK8oOG7+3chmzdBMhCnqsDWKg=\n-----END PUBLIC KEY-----\n",
  "secret": "84450f9d57e2b01a988e88f13a149c87dd6b382099534b396ee5f39e976503a0310f9591a6ca6517ccd4b589afed7b987c5539aa3b05bf44"
 },
 "dsa": {
  "priv": "-----BEGIN PRIVATE KEY-----\nMIICZAIBADCCAjkGByqGSM44BAEwggIsAoIBAQC4KJZ9qCJCy1MZJs33pxr891DK\nQfuYQoi+wOl6hwEDB5HhEZwZ2j9M6ccMIscMKr18cmtRwPjAkuDJPDTGzTEYCpLy\nDO/Us/CtdhKJ9CrE7YsjJlbha4VggEVsO5py09YzzdkNOGMgq0liJkllQbKC4yrG\nHo2cAtBCvRRAN+GJw2n3bhrBwMVrC8B5gXAZbPWg0PqvHXQ5GlwkjkZDSDVDcU0a\n1CxhupSvh4c/WdxKB17rukIMvxAtBDBUh7sxIr7u0h+n5eJ+rKkBB3yStvQP+qbG\nBtndoQtAF5aafjbGfC31ghYF4PV5OG0G8ClTFpvi7JXpioq2tCpVEAWTEQgvAiEA\nzrYovOhyq7R/+DfJ9hgvCeZ/+CRe12JTH5ND11fvjb8CggEAfm5L6W3iMs8PAoi+\n8FPX2NzW0Uhve/U7VZ/w7qLFN+u/5T74Nq3Zv0ofzf6892EsqMkdj4MG0RSizN52\nUwynljfQap0R+OgY+9IDEZzwC8Payu9IP/ewNSIJO1rzGEWlCBehwlooFnIo9Dqh\nKzyWLc17SKqtE9qDZFSQxx7Du5EXNKhyNY/r/7JDj06s6L8WYT2XisNkrODIKvsc\ngEUu9roCs+2MbUzYpvoG1WC3Wyn/iqJvEUajryst1aVlCf7dL25oEBmcTzCf6EBW\nhtOqOwt0lur9ZTlfEg42atStrYbZlSM9iMynIQfHDswVmzgB81q8UYVzHXm5uKCX\nCxbQpAQiAiAI4rslxgMGKwZHXEbIBnzSu5e3tswp8cBCDdjd/yivbg==\n-----END PRIVATE KEY-----\n",
  "pub": "-----BEGIN PUBLIC KEY-----\nMIIDRjCCAjkGByqGSM44BAEwggIsAoIBAQC4KJZ9qCJCy1MZJs33pxr891DKQfuY\nQoi+wOl6hwEDB5HhEZwZ2j9M6ccMIscMKr18cmtRwPjAkuDJPDTGzTEYCpLyDO/U\ns/CtdhKJ9CrE7YsjJlbha4VggEVsO5py09YzzdkNOGMgq0liJkllQbKC4yrGHo2c\nAtBCvRRAN+GJw2n3bhrBwMVrC8B5gXAZbPWg0PqvHXQ5GlwkjkZDSDVDcU0a1Cxh\nupSvh4c/WdxKB17rukIMvxAtBDBUh7sxIr7u0h+n5eJ+rKkBB3yStvQP+qbGBtnd\noQtAF5aafjbGfC31ghYF4PV5OG0G8ClTFpvi7JXpioq2tCpVEAWTEQgvAiEAzrYo\nvOhyq7R/+DfJ9hgvCeZ/+CRe12JTH5ND11fvjb8CggEAfm5L6W3iMs8PAoi+8FPX\n2NzW0Uhve/U7VZ/w7qLFN+u/5T74Nq3Zv0ofzf6892EsqMkdj4MG0RSizN52Uwyn\nljfQap0R+OgY+9IDEZzwC8Payu9IP/ewNSIJO1rzGEWlCBehwlooFnIo9DqhKzyW\nLc17SKqtE9qDZFSQxx7Du5EXNKhyNY/r/7JDj06s6L8WYT2XisNkrODIKvscgEUu\n9roCs+2MbUzYpvoG1WC3Wyn/iqJvEUajryst1aVlCf7dL25oEBmcTzCf6EBWhtOq\nOwt0lur9ZTlfEg42atStrYbZlSM9iMynIQfHDswVmzgB81q8UYVzHXm5uKCXCxbQ\npAOCAQUAAoIBADm3jrGZr1Typ8l2C1neEhzD4BbnZyGHbvhoaJfYgGLSxapkQhCO\nlh3G1vsr5vSI5tMEYXCy8SAwyxivlZMvMHfdBN3BBu5DVwrYlRueH3piLlOaLcEj\nL1MYi5QfT5dWoN8BGjNuw94VWnicUYhHt6bfq3RqgeTF6xIpk9LzxeS0VbxCdOmq\nzhjTO3AoctAkdVF0lpAqCxXbo7RKuwQ9S1FRPjzjzWP1WPT9ltUzIKZHC9/657Ir\n10zjJ6FvcP/tYL33TT0XGzWS64drPlcRxJHl4uCo8CGzE4O2IjW4Jx/K6XNATJwB\nEqzvODgsb0QNuRhwTDRgWhA1EvVPdgkeQlI=\n-----END PUBLIC KEY-----\n",
  "der": "MEUCIQCLkEDHkDEOyXtEQ6ZTXEIY1o3GFcDHww7h7lX/v4SKiQIgVcRqJRFq1ZNHWI2QTsN6B5GC1XOJHMmfxXcWCkmI+Zo=",
  "p1363": "OwWlzQOkH4K82BCrHmo1amRNHxiKUnE6OXu3aaz+0XNJoO3dl8OjYjkFN22QK18NeATM79dRxigLimg2im5e2g==",
  "sha1": "MEUCIQCjuowcjWH+r5ixVHxutNpzue4GQzH20m+ZIz9scrX/lAIgS/e0Yus/q40P5zMhbACRWJMxu5AaDLLCze8016OrQ9s="
 },
 "enc": {
  "pkcs8": "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFNTBfBgkqhkiG9w0BBQ0wUjAxBgkqhkiG9w0BBQwwJAQQq8NeSF0XXrRgxLEO\n3MFNzQICCAAwDAYIKoZIhvcNAgkFADAdBglghkgBZQMEASoEEKpwPXuffdAE7HN4\nI1DQMacEggTQsj1P8KyJpIDfL0GzyEh/Q2vfa6rqKAul/HjCYHyUBLDP4J7cPWXQ\n6mldpQ7CZWu+mg/ehigTjb7wnQwUVK15Im3uKY4vOO62+4NNtBns2zSpDtLBI0V8\nz6hScvMVVVbj9IQMZAU9x82te2ZT9RF4bVGP8DTI7wcpy7hZn+h/uJwFYt+uL9gg\nPJjvJQGdZj+VF5PZbdIVTyQvNTte9lcAxnzLKaCrb2/K5aVcK7YCxpmFNKSOQl/y\nzBbvZ0GJw97Qexp7hhvr/1AAV78ftOvF7cW9zqG8noF7Xy3MCVXvNxqJxnRaH9ZV\nVUbFuNO7Lu62Cao5NLnuy/dKzbJ2BWelsHIMgbXi9v1qR+NfMLGzsA1H9zrbvPeY\n1N4JEw5kThxghK0Z0EILt7wrGmwlf6vCJ0XE1+yevCfGBpzhTtPZmfPKB8DhW989\nq1l9kl3vB0R5YSlPGZ3YROMHdfQGEHX0kxI3R1/EnFYrMEa+SD8hAeTagLK1BloS\nF+y6Xyx1VGK4USZVdtKov0oTJO/Fus1d14J7EyQzO9YgjYn8jyWssM2BTmdvJZrY\ntRmyvkIXTIf7wTAojvCyeCz5n99BaFHb2b4Wg/czyKpaiE6jWdLL5gNT4KpDgeAu\nnI6rNpzpi15d8Vvimz86AulD89OtADb/kMw+uOZc26lgiblX6za0DFcTte+Juak5\nBwZot3e8D3Nh8hEG29OaqbB0/PrOLTpR/ZK4QJtH/t4TL7nAEs3V7/AEt0Yb9mGv\nmtJpY6EpvjUbpyGxWptkxs1EzXp6w0zTf2ZPSX2cZEWOJRmq2LcZ7PGHIibC6uqk\ntztXNxaWD3YB52AwePwGJDPP5FYRh46xmOOybA6uykb/Q3zdk2wwOUvVmIVEhX32\npb2j6zHgy2QiCq2S12WRkg7ORN3+y8W2fcvYgy1pUfHjM3eMImNSiacJO/3SGPnU\n6Cv2j9yoIVPkXDoDpAcjYtp/Ado6qksBWaGtIW4tVPwnOuEro6SA1uOQc+dSFZhu\nta9RXjAhoo6fMpXy53DH2ZiEgE/Ow39QcbkY3Tm7BDf0TA0iG3mCQrvIltuG9E23\nw63uoG9yB0WzIcMdwBlHzpa93K8yo+zStODEeEafzvV74Y6riwsi0fx2pxkjPtnd\nzB/jFW9t+CA6e8OYfUPlvgjoQtg+S+cQX3eqMXWtl3B8VDKGYl5cBNhJrH8fQSV9\nUB+onB2y2BdhyCYvdgWgMfweLvTmtBrAIXc4lUEcsC/bSUEows/AvRIVfc2w4Dz8\nC7/HOvypn4pC19FniMZcYvHacscijpofMUvirqIaFHn8lLaVTdiGr1oRHNUZWR3N\nk435eV2r4JPihBV+N1ng1fVeHwKddvon1lhvlzI3R7EPFCHwl5dAF2ZMgP6/5GHM\ndSG3esmFzTP95bo8TurOHn9pHTsgxg1zd5nno4KelvC0ZhycLLAGiHHY/W66GtsE\nrTYi32YgVMCKXDxdFNIzrMry3EncJFT+zpLyhX9GPiHYuXZ57D6I9U/ZUa21epxy\nEKF8pmP5F8fWDotCEM5YRhuSB186znzteXfSyKgZRJS7l02BD1cTPEf6+lxFRw2W\n4VghExXg22dgwnB93WWLWuCZYcTUIK6wYSXIDO480LJep26H6M8hkZM=\n-----END ENCRYPTED PRIVATE KEY-----\n",
  "pkcs1": "-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,1A08A871F5117C1DDC846F94F9029859\n\ng3KYYFrEvBRVL1mTjVy70zdfDi83DXmTuYQwhtfc+V2+vGupQa1I0WFlZBJKe9Db\nM3OgQUG+/bd1QeUaPSWSvS2fsRGxNn7TJBtfb6d+lg1ftd/C5T+6hpxWYzGAZccx\nqY/AlYcqu7wyuHr7yI+JMuVV+ZNBtuFsqcJ4g5gl+rwa3d2mEZ+qg1jh+JNyqFrv\nhd07l0KbrHXry04zLkuVwmF33T1NyAOscd1iKFxIKhwZeNnwhmK0OYVxNC3F/4ro\n2sdU9QOHBM8U+z/ZoGIlepkKhBkJVwhg8PR7CX9V/zQwG8W5Ldo42wb70ez98dzh\n20tpY5OPhUmpqN7+Zn2PQuGPMdR4uXFoJMz8yEpmfdYuaAcEANJbXahDmJkI8axY\nGIgHspfvyJ7k5Wjn14T1YbFlptLEy52YjLR11OwHuz4sax1ZfMLEJ6QfWneoMpBH\nw4stZDuLz2Di1V6S1Sh3M1vkzPs0LqqdWmMF9KUyoOHaiQ2wKIQYnqZ7Ez8oooHo\nUDzw8iy4TSzyH3y8Sl8WqND5+DYcCBzMmP5BMSECmk65y9vHtG/EWGmO9VSioYEC\n41WUvmC9NJsN5BEKFQVe3LP8XKmpZoedKHnBggeLIgeDte03YF0Bq9eL0S+IhXMA\nb5k483bRhm5i+6EEzQLd1IYrJsHqONzIGjsWMaU/4GSLU70G9g3BYDQDAcFAxdg4\nNN63AjEWCJqxIATH9RP5pb6dMwFslqBtl7FStVU/dUJv3c0cuVd937O2YDxblz/v\nwNkfibl8dvP3yY2bQnvf+lmKjiDHyyS6SKvEzEAm5kg2tSdnR+lBhnVn2CoCQCFa\nFPNQ0ZaJp+RLi9QSKKdTmrKKSQWF2CMnyL+5OEwXqP3rCfJjTaBvURGrwCJymmYp\nxusYuILrXUGmxsL7AbA37RmFt/WjIPjsIvSZCk6O3/StyK3t/sEVry/LoFLDvWf4\nYQC1B7R++sJ7u/3DXqVmNYKVkrrYz79hp0eYdJyrAOpl/joPbo8LZix3FgCFgTfx\nnGgg5zbaT5EE00m7rpwDv6XwB9wkwiFsVuhzTME2Saiw0V7rurAWgvRYVp4d+Hfy\nTNIZXQxBk3ywoinC/B1kaXUJdqDK9UjmNTIt+S5mvVj9M7x4Iu/r+G3on7IAHa/U\nPvREWtUJZzaibKt79pZ0DLsm/o39QD8/NDUclg9xwsWIFAfj0HYRT2zSOlgeOsKZ\nlMFAhx+fjgZ0uKRZ4fCAk5agGHfs1fNHIhmt10SznAKWkSoKDzFNOUyjGbC4uvv+\nE2GcmpcR5vUZvKoQN/nym3aXP0IYYFsk7yj1esIsM8w51HYX0ixrQ1AkUgRrJWMu\nlrxNXili09aWkButiv0dL6SoghhPuy4+cSYFVTukVqKHOzTKmYM2AROQP85tD+TN\nFS2KO60rhb/6ZV3ch8gWrfR8dhu5Ch8ytQWTPlqybJrlr1lXfGHf5zDARU050VbQ\nePnl5W0t1QDxILYyWYkMeyVLKKx5dMAJTr+8t4JaAaXO2SJ7UhrObVXPxSnGfETy\nHFl2BDe5wm7NrWSt8JK45k9ibEmrfHpR/pH5NStpWB7E95M8QE5VWMNtX+XnDZIX\n-----END RSA PRIVATE KEY-----\n",
  "des3": "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFJDBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQlXrCbYz8U/AG4fDo\nTITmKAICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQIIXCGpwb2/GMEggTI\nuw6qcthWFSsNdt3giC1QBlRF/vKD3vh4p+lEWHXOGoXsuaN+7xkxhKl3LJ9Ngabx\ndqJJjbc8s6r91929s7QQKFvar/YYBuVlp1a4YmcTbPb6dPItenSF4ON3pW6Dr5d/\n/IKGHcTsLGJ1wzRd2Eg78KIjfgbOCmnyV5IADk2TWp8iwweENpMY/5inP3IZg/NS\nef+wl8M+j3y6PqrEYJUkkw6IzWGgw3i7nJvH0NPKIWuNxkjp/72ZK32ipUk5bgJO\nowUAF7l1R/AKHdGOsk1Q+fULGGEHZwYGpWEY9aGRBh2I03jMEgxLMjhTCetD8I7z\nGTL2nypurMinUezopiDWEcEWkIBtoGObmskeCdx8zCIhYTCTga69WQkrsCS6Cc78\nGImwwaYje1g+TEYQf+ivgxuRblr2DQIC+Dlo98NmbqO6anERZIp2nIeYWBf0Vo/N\nObeYxgD0bBqvO9tEKPGqaQqBmO+9mzyVuCXQf0jW5ORSt+XRPKEkdr7L6lKkk4ae\nnp3XM3N25c2kYultXsziA/93K0V5+11POVv7+hpjKLxMPwjh0vL+8KHmRy95sZJu\n6MD13JUbIcbo6CfPCdIBJn6yFugU9NX3Kq38/oC0/Egm4hWonSaeGzOabnee9avP\nonnSmcUm08JRZEq8CDwKI+E7O1W7lRXw0UrNkMExkiHh76UO9TDDTL25v+60T2hd\nvnrN7cufYA7Sm3yM81JSUhY4+fnDhUy9+7Kk6fyfxZ74GTcHjAxXpSBocXd1AAfQ\nuozfExzxOdyyrJd6Q4uUPss6xPNrcNODjsluYQiPdvDKbbPwaKgIS7LEkQb/K75y\nuNxai1oFm4R7eiSuQvSwXZHyRArWXi/s5WEaOIas4h+n+lEJFLZ2/7JX6SFEstWC\njGclARmvYb+uPMeWttM6frED4EEfwaZC8eMoV464Ky9AFZYqbiRrvldv4aha0c8v\nruFCax43mmAuuUkz7Nne6eCh2QQU0bIFoNsGQQzgTIcE0CLN7RboON0DI6GV4q6d\n3o4M2mjAWiBi6pggKbiukIddeO89L1bzGPff5mNRn8Nde1ciB2WRM4Jma2qTPepj\n1nyZzTGVBOwk4/jo+Lo2nedytBG380mDBfQ5ZdunlO3fWYF8pepIsXhig3XQQC95\n2wgGAhF4GB7lrXiUVOGNGTsYjx1iDx0IJY/N7FGZJLMqEYCiZ/0yrC4cvzl2O2Ee\nSPT42c02k7o7p/AsLhluXLYHKP1sMOQFDfG/dojabelDqfJ391X/cfxjj9ML6lar\nw4tU7fsd0czvcTVKilMxa37GZEzwuzfmm+76Cg/W86O9pRzggLkRmHG2W0Eey7Gs\nW1O+xFbd7gtk0/MODKlZuxGV7H/kQA93JaJMIzdykorItyLqcx/ybuLG88m6t/Jk\nEv1RxpeBMmqi6k4sSFzEoeHWGjR4W/AiKxU0FLpX+VyjRy5KcLrrjyV9nw+nv5Zs\nWx0rwwSksC/yarodU2qGQipsTGy7D5cu6Tm8kWPvNfh9FQVlj2F1Ek/oglop+kcE\niFuKiPCt4QDGCg+ow13Xt8/MVvAay9rsLNhRRA3cibLH9IbEOsOA0OeFNfdvzuOv\nsL1sdiQht/Yibmb2ENhFByoVaVQkk8PD\n-----END ENCRYPTED PRIVATE KEY-----\n",
  "ed": "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIGjMF8GCSqGSIb3DQEFDTBSMDEGCSqGSIb3DQEFDDAkBBD8aLP/t+E7EMHNOATn\nmUr6AgIIADAMBggqhkiG9w0CCQUAMB0GCWCGSAFlAwQBFgQQbSA6bmTZ7p/pSyo+\nZw4yTARARk3X+X5LWP+1UnO0Pl3jtn7BZa+iDkigpDPTDA0MPzM/tpa9Cen9Rnlh\n5QuE97Qdv37DRdS4pkaSbLHHSQyM3Q==\n-----END ENCRYPTED PRIVATE KEY-----\n",
  "rsaPlain": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDtoOIXmn2FtiV8\nHccsANl50rPNkghBDSw0EWufDg0uX5aGMbGCa155yAANAsPH+KmA9BiUwVVKUHj4\n+ne0IIhks7DXs33Qx2xoCIJqo94WeKmtbpZKPsg1ql6+c3B6Vlpq6av7bbj0aqcZ\nln3qljpc3cP3aHahlseIsSF7EosuBIqpWHlFpmnMk4nX/KMekc24otyFRJfmxAzO\nZtaf3B8E4mgMEiVRrhzx0W4HfxhxnjAkgGhuUln8XUjeUYHvZ3uErQcC6T5wReKN\n8DNxOMFfy35n5UC4e03nFDbGH/G9eTwfqwGukLKmaYnrjBoZHcNjX0/7aGWMzqy/\n71aoLgrjAgMBAAECggEAJ482CdSSpapEzpyCe4/fT0ma3Kk9WIm3MdUzQ8pqEANN\nItADtiuREdhlhxpOZOxqWOkfbSb2alBqo0Bx9yRyBcRoYgXOoe2L3ZHfwZ3AK6Db\ngTTng5AKHUJcqCYTCTrLrgAdZ9ZvXmP2/OqHJyuVUb/Vj6BDckk7X0U7HABiopPq\n0vjCdYp7jaFlac0PID70nmVFo7zFb02CBSvSGr0Y73qDcKbU7gyJ7zMhJxBd7W7D\nZgE1LtYU1PTKpDCbPTtF35Ghncq1ASr6tbS0iAb2R05DHwkz4NxX2hwlHNepmlWU\nUGVb5qqKqdUKiqpX2WhGUy/6JRY5scwpSZvwb1CU0QKBgQD96RBldZQIU0UjAkBV\nvN0cNDOiJ1CRQtC3Zb56q5soZZq8MZ2es0eXggpbuup6jB/K0Db/84ZCBHrSCIhQ\nMJ971xfmQA+4jCa7QkxZgOQIbAx7036p7NsVKzHEeh7GXyrykpmFIJpWmnPTvhN7\nOl9SlHTGCXasEY6nhqVXSx/NCQKBgQDvlYQ2nFPFz6Goo5L33yh3y6R3i5TAERs7\nAPNV+SssR1WOWvAI1MFrz/B8KATuafiLpsGcGXRemhObdHuUvF46eYcNlMRC94bc\nAcQBz3ZCz/1uD65ICHp7jHrC/WfMXNzG2W+F9IdZ+x6dwixLuDSOjr4tILsG+4P2\nWl4y8HC/iwKBgE1xiau4egc0BrFP3XmJGlOg5GK/5QX5QBm/8aIOt0tR+ikOZQnj\nmqFua2RhFWV9WbENYskcaMW4AhIPwivbOLmX+FUlEuZx8NpKtWjTNDoRYpld/5Mq\niAPj4dEQglR08G9+IU8Gi6yAfXWG0wBR5IMWfqtsdYKz9DPKkKGYa0GpAoGAWVwv\nIB9Wr6Ut6rR4ELPPaD8wbNZG+QxoV62XFS4GiFFi++G3PdP9ALViQSy8CiDEb3IX\nLJ3h5ZcaURU1Mti/XJgPY2VlfoTMbCrMbNBwj6L8J5z5qCxhYsuWzjuuB29reU+I\nZTI7ebhMRxMxalyeXb2n+TUIDSaqpaw3DlDX/NkCgYAD237GgkKwz/JrnJ5Gijm+\nxBM2QVxGA+6BLEvKTLQyCVgFb7l5+/2rasvErzoPPjpyg3iBIQvbZV0fzZssRYid\nUpYuH0Vmg08HQ4cNJ4DC9ecqKeUvXIqxrpDzwT9q+Z1FMLUEnU4icmeorKdwRA/6\nCVd9zFt3HqSgPH0ISLZoig==\n-----END PRIVATE KEY-----\n",
  "dsa": "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIC1TBfBgkqhkiG9w0BBQ0wUjAxBgkqhkiG9w0BBQwwJAQQG+gLSNF8YcOrDqR/\nfS/qSgICCAAwDAYIKoZIhvcNAgkFADAdBglghkgBZQMEASoEEPjdvUBpuk12zdAB\np44a96QEggJwjBLdGBcOwaDKM7hmbqg/VO6Cuwt2t7Xc5BEWac7gWPRedxFAK8Ym\n27bvmcCge5srCzNWLWC2CkxjHIURkodRjbKKkHC9p/1av7hyeOBkL8s3GfnVCK2b\n/gbi3hLpMXKhPLAhadMn5gWy2c5TCyXZ8lwsjY7O2weDFF+Va1KYN+iXxVxcInc9\nUxp3D91T2HKWLAY9DlplyydWOJlpCfhmRl1lXzJ+MJBcJin5E8k9KBTbkgvwfUio\nTOILbMRmbwqatlZzRDJcyj6SYBtqP39316dcWFclAm5EpkXTDyDAy+QeawzayCic\nvbVyhQsfN8un7/218Ky9Xa3nImMCDFIUHmfz98eaMnYIat3o2QsS7jTTwjAiF6O1\n6ofzRDeYi+IEYJ+6axNTkbOG7F2v6Jm3ZlH1z1OVUZ43OQ4EZpXa+YeAoImPoBgI\nzvRddDfhCD7B9VTTxi15US3NLZKvf4Ua/XzMQZq5r0u1A+Ht8h/wDhktmo9tHTze\njLftE0n+RchNFiPLJ/6Ebmyk6/Ck53K34FfCsdW/7oBbLCjP/BbY8FCJsGOVh2D2\ncgS3XmARRaO0G81CGFV0kixWCAecb66i6AOs4iPz0jJz3qR7JYr87YG7N1V7p9aJ\nj2QJ8FUopeerDU0bDXMeEcsx4pwt2lcLXUyH16L3V7RxPeznfYdmpDe3OB7Nh41H\nmZ2o+n5+4g3ma87HlxSl8tmF71AKNGyi2CS/PPngBcmAkP2YJQXg9+Yeg/lqk+ga\n0Kdpd4ykc6JyYDi909RyYMp+k0q7yH3YbA8d19HNiDwZ3nWAzb5xtD4FECd2p+hd\n23+WX8G5OR7s\n-----END ENCRYPTED PRIVATE KEY-----\n"
 },
 "p12": {
  "modern": "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",
  "des3": "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",
  "cert": "-----BEGIN CERTIFICATE-----\nMIIEIDCCAwigAwIBAgIUZXc4wsQFghqudo40aBMYULbyJB4wDQYJKoZIhvcNAQEL\nBQAwaDELMAkGA1UEBhMCQlIxEjAQBgNVBAgMCVNhbyBQYXVsbzEOMAwGA1UEBwwF\nU2FtcGExEzARBgNVBAoMCkdyYWFrIFRlc3QxCzAJBgNVBAsMAlFBMRMwEQYDVQQD\nDApncmFhay50ZXN0MCAXDTI2MDkyNDE5Mzc1NFoYDzIxMjYwODMxMTkzNzU0WjBo\nMQswCQYDVQQGEwJCUjESMBAGA1UECAwJU2FvIFBhdWxvMQ4wDAYDVQQHDAVTYW1w\nYTETMBEGA1UECgwKR3JhYWsgVGVzdDELMAkGA1UECwwCUUExEzARBgNVBAMMCmdy\nYWFrLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDtoOIXmn2F\ntiV8HccsANl50rPNkghBDSw0EWufDg0uX5aGMbGCa155yAANAsPH+KmA9BiUwVVK\nUHj4+ne0IIhks7DXs33Qx2xoCIJqo94WeKmtbpZKPsg1ql6+c3B6Vlpq6av7bbj0\naqcZln3qljpc3cP3aHahlseIsSF7EosuBIqpWHlFpmnMk4nX/KMekc24otyFRJfm\nxAzOZtaf3B8E4mgMEiVRrhzx0W4HfxhxnjAkgGhuUln8XUjeUYHvZ3uErQcC6T5w\nReKN8DNxOMFfy35n5UC4e03nFDbGH/G9eTwfqwGukLKmaYnrjBoZHcNjX0/7aGWM\nzqy/71aoLgrjAgMBAAGjgb8wgbwwHQYDVR0OBBYEFEZlPe5AwdbrsbjhyH68QL43\n6kY3MB8GA1UdIwQYMBaAFEZlPe5AwdbrsbjhyH68QL436kY3MEoGA1UdEQRDMEGC\nCmdyYWFrLnRlc3SCDCouZ3JhYWsudGVzdIcEfwAAAYcQAAAAAAAAAAAAAAAAAAAA\nAYENcWFAZ3JhYWsudGVzdDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIw\nDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAj+ojoizcAeBUG1NQ\nh0ARl4TDShVe+s0NKbQr6LBFbhjfi+1qKXcrVxpgObSBPwe2obLdNixBAHilCC/9\nM4bnicqu2YDaQV47lhP/15gG4t/5Yffz1frWPBZ2GNaBIIuSEp+DHSrYVfl6liNx\nNf09JRV8RUclEq9PN5/8HuN79seDOJN4JUsl4wxACBGjkMHwI2/meT/i6PH9YmLE\n/XNkW2BoorJ4t5OyxCtKVUmr1UIZpV6oAkdctz+FVVZi5ascYyu8cp/Hnm4D5Ctj\n1o47DVvLN49XuR9wKdd8H53kSSE8QiHAWHOU5fhVCkYwcMu2i64ybgCA0MfEbkRo\naWEclw==\n-----END CERTIFICATE-----\n"
 },
 "certs": {
  "rsa": "-----BEGIN CERTIFICATE-----\nMIIEIDCCAwigAwIBAgIUZXc4wsQFghqudo40aBMYULbyJB4wDQYJKoZIhvcNAQEL\nBQAwaDELMAkGA1UEBhMCQlIxEjAQBgNVBAgMCVNhbyBQYXVsbzEOMAwGA1UEBwwF\nU2FtcGExEzARBgNVBAoMCkdyYWFrIFRlc3QxCzAJBgNVBAsMAlFBMRMwEQYDVQQD\nDApncmFhay50ZXN0MCAXDTI2MDkyNDE5Mzc1NFoYDzIxMjYwODMxMTkzNzU0WjBo\nMQswCQYDVQQGEwJCUjESMBAGA1UECAwJU2FvIFBhdWxvMQ4wDAYDVQQHDAVTYW1w\nYTETMBEGA1UECgwKR3JhYWsgVGVzdDELMAkGA1UECwwCUUExEzARBgNVBAMMCmdy\nYWFrLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDtoOIXmn2F\ntiV8HccsANl50rPNkghBDSw0EWufDg0uX5aGMbGCa155yAANAsPH+KmA9BiUwVVK\nUHj4+ne0IIhks7DXs33Qx2xoCIJqo94WeKmtbpZKPsg1ql6+c3B6Vlpq6av7bbj0\naqcZln3qljpc3cP3aHahlseIsSF7EosuBIqpWHlFpmnMk4nX/KMekc24otyFRJfm\nxAzOZtaf3B8E4mgMEiVRrhzx0W4HfxhxnjAkgGhuUln8XUjeUYHvZ3uErQcC6T5w\nReKN8DNxOMFfy35n5UC4e03nFDbGH/G9eTwfqwGukLKmaYnrjBoZHcNjX0/7aGWM\nzqy/71aoLgrjAgMBAAGjgb8wgbwwHQYDVR0OBBYEFEZlPe5AwdbrsbjhyH68QL43\n6kY3MB8GA1UdIwQYMBaAFEZlPe5AwdbrsbjhyH68QL436kY3MEoGA1UdEQRDMEGC\nCmdyYWFrLnRlc3SCDCouZ3JhYWsudGVzdIcEfwAAAYcQAAAAAAAAAAAAAAAAAAAA\nAYENcWFAZ3JhYWsudGVzdDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIw\nDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAj+ojoizcAeBUG1NQ\nh0ARl4TDShVe+s0NKbQr6LBFbhjfi+1qKXcrVxpgObSBPwe2obLdNixBAHilCC/9\nM4bnicqu2YDaQV47lhP/15gG4t/5Yffz1frWPBZ2GNaBIIuSEp+DHSrYVfl6liNx\nNf09JRV8RUclEq9PN5/8HuN79seDOJN4JUsl4wxACBGjkMHwI2/meT/i6PH9YmLE\n/XNkW2BoorJ4t5OyxCtKVUmr1UIZpV6oAkdctz+FVVZi5ascYyu8cp/Hnm4D5Ctj\n1o47DVvLN49XuR9wKdd8H53kSSE8QiHAWHOU5fhVCkYwcMu2i64ybgCA0MfEbkRo\naWEclw==\n-----END CERTIFICATE-----\n",
  "ed25519": {
   "cert": "-----BEGIN CERTIFICATE-----\nMIIBhzCCATmgAwIBAgIUenwQIk0RSt+EAnqnjWBR5tvD6zowBQYDK2VwMCgxFjAU\nBgNVBAMMDWVkLmdyYWFrLnRlc3QxDjAMBgNVBAoMBUdyYWFrMCAXDTI2MDkyNDIy\nNDczN1oYDzIxMjYwODMxMjI0NzM3WjAoMRYwFAYDVQQDDA1lZC5ncmFhay50ZXN0\nMQ4wDAYDVQQKDAVHcmFhazAqMAUGAytlcAMhAMEML/pET+jpU+C4aO0JfnoAQVFN\nI/tvCvY3Y528u/zvo3MwcTAdBgNVHQ4EFgQUya4l2nBDlMouA/ifIL6EVSBF9esw\nHwYDVR0jBBgwFoAUya4l2nBDlMouA/ifIL6EVSBF9eswDwYDVR0TAQH/BAUwAwEB\n/zAeBgNVHREEFzAVgg1lZC5ncmFhay50ZXN0hwQKAAAFMAUGAytlcANBAEb38jkt\ndv/zgakyMebG+FUMT4V6miJF6LSxC4zIaoRyplC7/t7UomvBsgDhGdv8HgV8Y05m\nhgvIGJtiYc76DgM=\n-----END CERTIFICATE-----\n",
   "key": "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEICJnwOFrZvTsEbrMItbnp04cvoUc08Ub6IF8zI9TbmL0\n-----END PRIVATE KEY-----\n"
  },
  "ed448": {
   "cert": "-----BEGIN CERTIFICATE-----\nMIIBmDCCARigAwIBAgIUAVCmVaWdXDCf+xwYOEyiO+SQo20wBQYDK2VxMBsxGTAX\nBgNVBAMMEGVkNDQ4LmdyYWFrLnRlc3QwIBcNMjYwOTI0MjI0NzM3WhgPMjEyNjA4\nMzEyMjQ3MzdaMBsxGTAXBgNVBAMMEGVkNDQ4LmdyYWFrLnRlc3QwQzAFBgMrZXED\nOgC3uJPeh/RoC40zQBOvPM+XI7GockJGEPyWA6nXHBy0qh4y/XMOB5qqqaN2+yzH\nrCTskI0maddMawCjUzBRMB0GA1UdDgQWBBT3SHcFpe3mCNYib6sV9Ywtqra6iTAf\nBgNVHSMEGDAWgBT3SHcFpe3mCNYib6sV9Ywtqra6iTAPBgNVHRMBAf8EBTADAQH/\nMAUGAytlcQNzAH1ulRhkD+NQpMVOVwqBTDxZ0Q2k11lX33FbpxbCGmW61GfZtNGX\nowTsrCDcm8s3kxOanCAyCcnFAD5+QJyKhvjrLpAufb6G3cr/0RIGmkoDtrWLmOG7\n4T1UbFBswmAxHVuFkI7wSch1xogbWmIop0EMAA==\n-----END CERTIFICATE-----\n",
   "key": "-----BEGIN PRIVATE KEY-----\nMEcCAQAwBQYDK2VxBDsEOczfOm32hBLORoRRqp61GbgJSsVbvNNVuRIUjc7lmkue\nq2cnP/O+99nmePRSSUu9Cyt0+/7mveDSuw==\n-----END PRIVATE KEY-----\n"
  }
 }
};
const MSG = Buffer.from("graak crypto3 corpus");

const line = (label, value) => console.log(label + ": " + (typeof value === "string" ? value : JSON.stringify(value)));
const attempt = (label, fn) => {
	try {
		const value = fn();
		line(label, value === undefined ? "ok" : value);
	} catch (err) {
		line(label, ["throws", err.constructor.name, String(err.code).replace(/FAILED/g, "FAIL"), err.message]);
	}
};

/* ---- Ed25519, Ed448 */
for (const t of ["ed25519", "ed448"]) {
	const priv = crypto.createPrivateKey(F[t].priv);
	const pub = crypto.createPublicKey(F[t].pub);
	line(t + " types", [priv.type, pub.type, priv.asymmetricKeyType, pub.asymmetricKeyType, priv.asymmetricKeyDetails, pub.asymmetricKeyDetails]);
	line(t + " public from private", crypto.createPublicKey(priv).equals(pub));
	line(t + " pem out", [priv.export({ type: "pkcs8", format: "pem" }) === F[t].priv, pub.export({ type: "spki", format: "pem" }) === F[t].pub]);
	line(t + " signature deterministic", crypto.sign(null, MSG, priv).toString("base64") === F[t].sig);
	line(t + " verify node signature", [crypto.verify(null, MSG, pub, Buffer.from(F[t].sig, "base64")), crypto.verify(null, Buffer.from("other"), pub, Buffer.from(F[t].sig, "base64"))]);
	const damaged = Buffer.from(F[t].sig, "base64");
	damaged[damaged.length - 1] ^= 1;
	line(t + " verify damaged", crypto.verify(null, MSG, pub, damaged));
	line(t + " verify short", crypto.verify(null, MSG, pub, Buffer.alloc(10)));
	line(t + " createSign", crypto.createSign("sha256") && "constructed");
	line(t + " jwk", crypto.createPrivateKey(F[t].priv).export({ format: "jwk" }));
	line(t + " jwk import", crypto.createPrivateKey({ key: priv.export({ format: "jwk" }), format: "jwk" }).equals(priv));
	attempt(t + " sign with digest", () => crypto.sign("sha256", MSG, priv).length);
	attempt(t + " pkcs1 export", () => priv.export({ type: "pkcs1", format: "pem" }));
	attempt(t + " sign with public key", () => crypto.sign(null, MSG, pub).length);
	const fresh = crypto.generateKeyPairSync(t);
	line(t + " generated", [fresh.privateKey.asymmetricKeyType, crypto.verify(null, MSG, fresh.publicKey, crypto.sign(null, MSG, fresh.privateKey))]);
	line(t + " der sizes", [pub.export({ type: "spki", format: "der" }).length, priv.export({ type: "pkcs8", format: "der" }).length]);
}

/* ---- X25519, X448 */
for (const [name, key] of [["x25519", F.xdh], ["x448", F.xdh448]]) {
	const a = crypto.createPrivateKey(key.a);
	const b = crypto.createPublicKey(key.b);
	line(name + " diffieHellman fixed", crypto.diffieHellman({ privateKey: a, publicKey: b }).toString("hex") === key.secret);
	line(name + " types", [a.asymmetricKeyType, b.asymmetricKeyType, F[name].pub === crypto.createPublicKey(F[name].priv).export({ type: "spki", format: "pem" })]);
	const pair1 = crypto.generateKeyPairSync(name);
	const pair2 = crypto.generateKeyPairSync(name);
	line(name + " agree", crypto.diffieHellman({ privateKey: pair1.privateKey, publicKey: pair2.publicKey }).equals(crypto.diffieHellman({ privateKey: pair2.privateKey, publicKey: pair1.publicKey })));
	attempt(name + " sign", () => crypto.sign(null, MSG, a).length);
}

/* ---- DSA */
{
	const priv = crypto.createPrivateKey(F.dsa.priv);
	const pub = crypto.createPublicKey(F.dsa.pub);
	line("dsa types", [priv.asymmetricKeyType, priv.asymmetricKeyDetails, crypto.createPublicKey(priv).equals(pub)]);
	line("dsa verify node der", [crypto.verify("sha256", MSG, pub, Buffer.from(F.dsa.der, "base64")), crypto.verify("sha256", Buffer.from("x"), pub, Buffer.from(F.dsa.der, "base64"))]);
	line("dsa verify node p1363", crypto.verify("sha256", MSG, { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(F.dsa.p1363, "base64")));
	line("dsa verify node sha1", crypto.verify("sha1", MSG, pub, Buffer.from(F.dsa.sha1, "base64")));
	line("dsa verify wrong hash", crypto.verify("sha1", MSG, pub, Buffer.from(F.dsa.der, "base64")));
	const own = crypto.sign("sha256", MSG, priv);
	line("dsa own signature", [own.length > 60, crypto.verify("sha256", MSG, pub, own)]);
	const p1363 = crypto.sign("sha256", MSG, { key: priv, dsaEncoding: "ieee-p1363" });
	line("dsa own p1363", [p1363.length, crypto.verify("sha256", MSG, { key: pub, dsaEncoding: "ieee-p1363" }, p1363)]);
	line("dsa pem out", [priv.export({ type: "pkcs8", format: "pem" }) === F.dsa.priv, pub.export({ type: "spki", format: "pem" }) === F.dsa.pub]);
	line("dsa createSign", crypto.createVerify("sha256").update(MSG).verify(F.dsa.pub, Buffer.from(F.dsa.der, "base64")));
	attempt("dsa jwk", () => priv.export({ format: "jwk" }));
	const small = crypto.generateKeyPairSync("dsa", { modulusLength: 2048, divisorLength: 256 });
	line("dsa generated", [small.privateKey.asymmetricKeyDetails, crypto.verify("sha256", MSG, small.publicKey, crypto.sign("sha256", MSG, small.privateKey))]);
	attempt("dsa bad size", () => crypto.generateKeyPairSync("dsa", {}));
}

/* ---- password-protected keys */
{
	const plain = crypto.createPrivateKey(F.enc.rsaPlain);
	for (const kind of ["pkcs8", "pkcs1", "des3"]) {
		const key = crypto.createPrivateKey({ key: F.enc[kind], passphrase: "hunter2" });
		line("import " + kind, key.equals(plain));
		attempt("import " + kind + " wrong passphrase", () => crypto.createPrivateKey({ key: F.enc[kind], passphrase: "nope" }).type);
		attempt("import " + kind + " no passphrase", () => crypto.createPrivateKey(F.enc[kind]).type);
	}
	line("import ed25519 encrypted", crypto.createPrivateKey({ key: F.enc.ed, passphrase: "hunter2" }).equals(crypto.createPrivateKey(F.ed25519.priv)));
	line("import dsa encrypted", crypto.createPrivateKey({ key: F.enc.dsa, passphrase: "hunter2" }).equals(crypto.createPrivateKey(F.dsa.priv)));
	attempt("import ed25519 wrong passphrase", () => crypto.createPrivateKey({ key: F.enc.ed, passphrase: "nope" }).type);
	for (const cipher of ["aes-128-cbc", "aes-192-cbc", "aes-256-cbc", "des-ede3-cbc"]) {
		const pkcs8 = plain.export({ type: "pkcs8", format: "pem", cipher, passphrase: "pw" });
		line("export pkcs8 " + cipher, [pkcs8.split("\n")[0], crypto.createPrivateKey({ key: pkcs8, passphrase: "pw" }).equals(plain)]);
		const pkcs1 = plain.export({ type: "pkcs1", format: "pem", cipher, passphrase: "pw" });
		const lines = pkcs1.split("\n");
		line("export pkcs1 " + cipher, [lines[0], lines[1], lines[2].split(",")[0], crypto.createPrivateKey({ key: pkcs1, passphrase: "pw" }).equals(plain)]);
	}
	const ec = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
	const sec1 = ec.export({ type: "sec1", format: "pem", cipher: "aes-256-cbc", passphrase: "pw" });
	line("export sec1", [sec1.split("\n")[0], crypto.createPrivateKey({ key: sec1, passphrase: "pw" }).equals(ec)]);
	const der = plain.export({ type: "pkcs8", format: "der", cipher: "aes-256-cbc", passphrase: "pw" });
	line("export pkcs8 der", [der[0], crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8", passphrase: "pw" }).equals(plain)]);
	attempt("export cipher without passphrase", () => plain.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc" }));
	attempt("export unknown cipher", () => plain.export({ type: "pkcs8", format: "pem", cipher: "nope", passphrase: "pw" }));
	attempt("export pkcs1 der cipher", () => plain.export({ type: "pkcs1", format: "der", cipher: "aes-256-cbc", passphrase: "pw" }));
	attempt("export public with cipher", () => crypto.createPublicKey(plain).export({ type: "spki", format: "pem", cipher: "aes-256-cbc", passphrase: "pw" }).split("\n")[0]);
}

/* ---- SHA-3 and SHAKE */
{
	const inputs = ["", "abc", "a".repeat(1000), "The quick brown fox jumps over the lazy dog"];
	for (const name of ["sha3-224", "sha3-256", "sha3-384", "sha3-512"]) {
		line(name, inputs.map((text) => crypto.createHash(name).update(text).digest("hex")));
		line(name + " hmac", crypto.createHmac(name, "key").update("data").digest("hex"));
		line(name + " one-shot", crypto.hash(name, "abc"));
	}
	for (const name of ["shake128", "shake256"]) {
		line(name + " default", inputs.map((text) => crypto.createHash(name).update(text).digest("hex")));
		line(name + " lengths", [0, 1, 7, 32, 168, 200, 500].map((n) => crypto.createHash(name, { outputLength: n }).update("abc").digest("hex")));
		line(name + " one-shot", crypto.hash(name, "abc"));
	}
	attempt("hash outputLength on sha256", () => crypto.createHash("sha256", { outputLength: 8 }).update("x").digest("hex"));
	attempt("hash outputLength matching", () => crypto.createHash("sha256", { outputLength: 32 }).update("x").digest("hex").length);
	line("getHashes", ["sha3-256", "shake256", "sha256"].map((name) => crypto.getHashes().includes(name)));
	line("copy", crypto.createHash("shake256", { outputLength: 8 }).update("a").copy().update("b").digest("hex"));
}

/* ---- PKCS#12 through tls */
{
	const pfxTests = [["modern", F.p12.modern], ["des3", F.p12.des3]];
	(async () => {
		for (const [name, b64] of pfxTests) {
			const pfx = Buffer.from(b64, "base64");
			const server = tls.createServer({ pfx, passphrase: "secret" }, (socket) => {
				socket.on("error", () => {});
				socket.end("hello pfx");
			});
			await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
			const outcome = await new Promise((resolve) => {
				const client = tls.connect({ host: "127.0.0.1", port: server.address().port, ca: F.p12.cert, servername: "graak.test" });
				const chunks = [];
				client.on("data", (d) => chunks.push(d));
				client.on("end", () => resolve([client.authorized, Buffer.concat(chunks).toString(), client.getPeerCertificate().subject.CN]));
				client.on("error", (err) => resolve(["error", err.code]));
			});
			line("pfx server " + name, outcome);
			await new Promise((resolve) => server.close(resolve));
			const context = tls.createSecureContext({ pfx, passphrase: "secret" });
			line("pfx secure context " + name, typeof context);
			attempt("pfx wrong passphrase " + name, () => tls.createSecureContext({ pfx, passphrase: "nope" }) && "accepted");
			attempt("pfx no passphrase " + name, () => tls.createSecureContext({ pfx }) && "accepted");
			attempt("pfx object form " + name, () => tls.createSecureContext({ pfx: [{ buf: pfx, passphrase: "secret" }] }) && "accepted");
		}
		attempt("pfx garbage", () => tls.createSecureContext({ pfx: Buffer.from("not a pfx file at all") }) && "accepted");
	})();
}

/* ---- X.509 certificates with keys and signatures mbedTLS does not know */
{
	const rsa = new crypto.X509Certificate(F.certs.rsa);
	for (const name of ["ed25519", "ed448"]) {
		const x = new crypto.X509Certificate(F.certs[name].cert);
		line(name + " cert fields", [x.subject, x.issuer, x.subjectAltName, x.validFrom, x.validTo, x.serialNumber, x.ca, x.fingerprint256, x.publicKey.asymmetricKeyType, String(x.keyUsage)]);
		line(name + " cert legacy", x.toLegacyObject());
		line(name + " cert checks", [x.checkIssued(x), x.checkIssued(rsa), x.checkHost("ed.graak.test"), x.checkIP("10.0.0.5"), x.verify(x.publicKey), x.verify(rsa.publicKey), x.checkPrivateKey(crypto.createPrivateKey(F.certs[name].key))]);
		line(name + " cert toString", x.toString() === F.certs[name].cert);
	}
	line("rsa cert verify", [rsa.verify(rsa.publicKey), rsa.verify(new crypto.X509Certificate(F.certs.ed25519.cert).publicKey), rsa.checkIssued(new crypto.X509Certificate(F.certs.ed25519.cert))]);
}
