# thinking
* edited images will have a unique content identifier from their original photo
* I don't want duplicate photos. so, if there are multiple of the same content identifier, I want them gone


# workspace
```
exiftool -T -contentidentifier -livephotovideoindex -runtimescale me/ > out.txt

exiftool -T -csv -filepath -contentidentifier -livephotovideoindex -runtimescale -r me/ > out.txt


taken:			oct 4
edited:			oct 25
transferred: 	oct 26

JPG
* MacOS-MD Item Content Creation Date

MOV
* QuickTime-Create Date
* 	gives the date that the edit happened

```